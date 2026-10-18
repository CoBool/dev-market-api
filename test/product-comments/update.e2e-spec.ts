import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Product comments update (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seller: { id: number; accessToken: string };
  let writer: { id: number; accessToken: string };
  let outsider: { id: number; accessToken: string };

  async function createProduct() {
    return prisma.product.create({
      data: {
        name: '댓글 수정 대상 상품',
        description: '상품 설명',
        price: 1000,
        tags: ['test'],
        sellerId: seller.id,
      },
    });
  }

  async function createComment(productId: number) {
    return prisma.productComment.create({
      data: { content: '수정 전 댓글', productId, writerId: writer.id },
    });
  }

  function patchComment(
    id: string | number,
    token: string | undefined,
    body: Record<string, unknown>,
  ) {
    const req = request(app.getHttpServer()).patch(
      `/product-comments/${encodeURIComponent(String(id))}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  }

  async function expectUnchanged(
    original: Awaited<ReturnType<typeof createComment>>,
  ) {
    const saved = await prisma.productComment.findUnique({
      where: { id: original.id },
    });
    expect(saved).toEqual(original);
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
      email: 'product-comments-update-seller@test.com',
      nickname: '댓글수정판매자',
    });
    writer = await createTestUser(app, {
      email: 'product-comments-update-writer@test.com',
      nickname: '댓글수정작성자',
    });
    outsider = await createTestUser(app, {
      email: 'product-comments-update-outsider@test.com',
      nickname: '댓글수정제삼자',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /product-comments/:id 작성자가 수정하고 응답 키와 기존 정보 유지 -> 200', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await patchComment(comment.id, writer.accessToken, {
      content: '수정 후 댓글',
    }).expect(200);

    expect(Object.keys(res.body).sort()).toEqual(
      ['id', 'content', 'createdAt', 'updatedAt', 'productId', 'writer'].sort(),
    );
    expect(res.body.content).toBe('수정 후 댓글');
    expect(res.body.id).toBe(comment.id);
    expect(res.body.productId).toBe(comment.productId);
    expect(res.body.writer).toEqual({
      id: writer.id,
      nickname: '댓글수정작성자',
    });
    expect(res.body.createdAt).toBe(comment.createdAt.toISOString());
    expect(res.body).not.toHaveProperty('writerId');

    const saved = await prisma.productComment.findUniqueOrThrow({
      where: { id: comment.id },
    });
    expect(saved).toEqual({
      ...comment,
      content: '수정 후 댓글',
      updatedAt: new Date(res.body.updatedAt),
    });
  });

  it('PATCH /product-comments/:id updatedAt이 수정 전보다 늦어짐 -> 200', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);
    const before = await prisma.productComment.update({
      where: { id: comment.id },
      data: { updatedAt: new Date('2000-01-01T00:00:00.000Z') },
    });

    const res = await patchComment(comment.id, writer.accessToken, {
      content: '시간 갱신 확인',
    }).expect(200);

    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );
    expect(res.body.createdAt).toBe(before.createdAt.toISOString());
    const saved = await prisma.productComment.findUniqueOrThrow({
      where: { id: comment.id },
    });
    expect(saved.updatedAt.toISOString()).toBe(res.body.updatedAt);
  });

  it('PATCH /product-comments/:id content 앞뒤 공백을 trim하여 저장 -> 200', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await patchComment(comment.id, writer.accessToken, {
      content: '  공백을 제거한 댓글  ',
    }).expect(200);

    expect(res.body.content).toBe('공백을 제거한 댓글');
    const saved = await prisma.productComment.findUniqueOrThrow({
      where: { id: comment.id },
    });
    expect(saved.content).toBe('공백을 제거한 댓글');
  });

  it('PATCH /product-comments/:id content 정확히 500자 -> 200', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);
    const content = '가'.repeat(500);

    const res = await patchComment(comment.id, writer.accessToken, {
      content,
    }).expect(200);

    expect(res.body.content).toBe(content);
    const saved = await prisma.productComment.findUniqueOrThrow({
      where: { id: comment.id },
    });
    expect(saved.content).toBe(content);
  });

  it.each([
    ['content 누락', {}],
    ['content 빈 문자열', { content: '' }],
    ['content 공백만', { content: '   ' }],
    ['content 숫자', { content: 123 }],
    ['content null', { content: null }],
    ['content 501자', { content: '가'.repeat(501) }],
    ['writerId 위조', { content: '위조 수정', writerId: 999999 }],
    ['productId 위조', { content: '위조 수정', productId: 999999 }],
  ])(
    'PATCH /product-comments/:id 잘못된 본문(%s) -> 400',
    async (_name, body) => {
      const product = await createProduct();
      const comment = await createComment(product.id);

      await patchComment(comment.id, writer.accessToken, body).expect(400);
      await expectUnchanged(comment);
    },
  );

  it('PATCH /product-comments/:id 제3자가 수정 -> 403', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await patchComment(comment.id, outsider.accessToken, {
      content: '수정하면 안 되는 댓글',
    }).expect(403);

    expect(res.body.message).toBe('작성자만 수정할 수 있습니다.');
    await expectUnchanged(comment);
  });

  it('PATCH /product-comments/:id 판매자가 자기 상품에 달린 남의 댓글 수정 -> 403', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await patchComment(comment.id, seller.accessToken, {
      content: '판매자가 수정하면 안 되는 댓글',
    }).expect(403);

    expect(res.body.message).toBe('작성자만 수정할 수 있습니다.');
    await expectUnchanged(comment);
  });

  it('PATCH /product-comments/:id 없는 댓글 -> 404', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await patchComment(comment.id + 1000, outsider.accessToken, {
      content: '없는 댓글 수정',
    }).expect(404);

    expect(res.body.message).toBe('댓글을 찾을 수 없습니다.');
    await expectUnchanged(comment);
  });

  it('PATCH /product-comments/:id 토큰 없음 -> 401', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    await patchComment(comment.id, undefined, {
      content: '인증 없는 수정',
    }).expect(401);
    await expectUnchanged(comment);
  });

  it.each(['0', 'abc', '1.5'])(
    'PATCH /product-comments/:id 잘못된 경로 id(%s) -> 400',
    async (id) => {
      const product = await createProduct();
      const comment = await createComment(product.id);

      await patchComment(id, writer.accessToken, {
        content: '잘못된 경로 수정',
      }).expect(400);
      await expectUnchanged(comment);
    },
  );

  it('PATCH /product-comments/:id 수정 후 상품 댓글 목록에 반영 -> 200', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    await patchComment(comment.id, writer.accessToken, {
      content: '목록에 보일 수정 내용',
    }).expect(200);

    const res = await request(app.getHttpServer())
      .get(`/products/${product.id}/comments`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: comment.id,
      content: '목록에 보일 수정 내용',
      productId: product.id,
    });
  });
});
