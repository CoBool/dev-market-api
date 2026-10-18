import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Product comments create (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seller: { id: number; accessToken: string };
  let writer: { id: number; accessToken: string };

  async function createProduct(sellerId = seller.id) {
    return prisma.product.create({
      data: {
        name: '댓글 대상 상품',
        description: '상품 설명',
        price: 1000,
        tags: ['test'],
        sellerId,
      },
    });
  }

  function postComment(
    productId: number,
    body: Record<string, unknown>,
    token = writer.accessToken,
  ) {
    return request(app.getHttpServer())
      .post(`/products/${productId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    seller = await createTestUser(app, {
      email: 'product-comments-create-seller@test.com',
      nickname: '댓글판매자',
    });
    writer = await createTestUser(app, {
      email: 'product-comments-create-writer@test.com',
      nickname: '댓글작성자',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /products/:id/comments 판매자가 아닌 사용자가 정상 작성 -> 201', async () => {
    const product = await createProduct();
    const res = await postComment(product.id, { content: '문의 댓글' }).expect(
      201,
    );

    expect(Object.keys(res.body).sort()).toEqual(
      ['id', 'content', 'createdAt', 'updatedAt', 'productId', 'writer'].sort(),
    );
    expect(res.body).toMatchObject({
      content: '문의 댓글',
      productId: product.id,
      writer: { id: writer.id, nickname: '댓글작성자' },
    });
    expect(res.body.id).toEqual(expect.any(Number));
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body.updatedAt).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('writerId');

    const saved = await prisma.productComment.findUnique({
      where: { id: res.body.id as number },
    });
    expect(saved?.productId).toBe(product.id);
    expect(saved?.writerId).toBe(writer.id);
  });

  it('POST /products/:id/comments content 앞뒤 공백 -> trim 후 저장 201', async () => {
    const product = await createProduct();
    const res = await postComment(product.id, {
      content: '  공백 제거  ',
    }).expect(201);
    expect(res.body.content).toBe('공백 제거');
    const saved = await prisma.productComment.findUnique({
      where: { id: res.body.id as number },
    });
    expect(saved?.content).toBe('공백 제거');
  });

  it('POST /products/:id/comments content 정확히 500자 -> 201', async () => {
    const product = await createProduct();
    const content = '가'.repeat(500);
    const res = await postComment(product.id, { content }).expect(201);
    expect(res.body.content).toBe(content);
  });

  it('POST /products/:id/comments content 501자 -> 400', async () => {
    const product = await createProduct();
    await postComment(product.id, { content: '가'.repeat(501) }).expect(400);
    expect(await prisma.productComment.count()).toBe(0);
  });

  it.each([
    ['content 누락', {}],
    ['빈 문자열', { content: '' }],
    ['공백만 입력', { content: '   ' }],
    ['숫자 입력', { content: 123 }],
    ['null 입력', { content: null }],
    ['허용하지 않은 필드', { content: '댓글', extra: true }],
  ])(
    'POST /products/:id/comments 잘못된 본문(%s) -> 400',
    async (_name, body) => {
      const product = await createProduct();
      await postComment(product.id, body).expect(400);
      expect(await prisma.productComment.count()).toBe(0);
    },
  );

  it('POST /products/:id/comments 토큰 없음 -> 401', async () => {
    const product = await createProduct();
    const res = await request(app.getHttpServer())
      .post(`/products/${product.id}/comments`)
      .send({ content: '인증 필요' })
      .expect(401);
    expect(res.body.message).toBe('로그인이 필요합니다.');
    expect(await prisma.productComment.count()).toBe(0);
  });

  it('POST /products/:id/comments 없는 상품 -> 404', async () => {
    const res = await postComment(999999, { content: '없는 상품' }).expect(404);
    expect(res.body.message).toBe('상품을 찾을 수 없습니다.');
    expect(await prisma.productComment.count()).toBe(0);
  });

  it.each([['0'], ['abc']])(
    'POST /products/:id/comments 잘못된 경로 id(%s) -> 400',
    async (id) => {
      await request(app.getHttpServer())
        .post(`/products/${id}/comments`)
        .set('Authorization', `Bearer ${writer.accessToken}`)
        .send({ content: '잘못된 id' })
        .expect(400);
    },
  );

  it('POST /products/:id/comments 판매자 본인이 작성 -> 작성자는 판매자 201', async () => {
    const product = await createProduct();
    const res = await postComment(
      product.id,
      { content: '판매자 답변' },
      seller.accessToken,
    ).expect(201);
    expect(res.body.writer).toEqual({ id: seller.id, nickname: '댓글판매자' });
  });

  it('DELETE /products/:id 댓글이 있는 상품 삭제 -> 댓글도 Cascade 삭제 204', async () => {
    const product = await createProduct();
    const comment = await postComment(product.id, {
      content: '함께 삭제',
    }).expect(201);
    await request(app.getHttpServer())
      .delete(`/products/${product.id}`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .expect(204);
    expect(
      await prisma.productComment.findUnique({
        where: { id: comment.body.id as number },
      }),
    ).toBeNull();
  });
});
