import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Product comments remove (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seller: { id: number; accessToken: string };
  let writer: { id: number; accessToken: string };
  let outsider: { id: number; accessToken: string };

  async function createProduct() {
    return prisma.product.create({
      data: {
        name: '댓글 삭제 대상 상품',
        description: '상품 설명',
        price: 1000,
        tags: ['test'],
        sellerId: seller.id,
      },
    });
  }

  async function createComment(
    productId: number,
    content = '삭제할 댓글',
    writerId = writer.id,
  ) {
    return prisma.productComment.create({
      data: { content, productId, writerId },
    });
  }

  function deleteComment(id: string | number, token?: string) {
    const req = request(app.getHttpServer()).delete(
      `/product-comments/${encodeURIComponent(String(id))}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
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
      email: 'product-comments-remove-seller@test.com',
      nickname: '댓글삭제판매자',
    });
    writer = await createTestUser(app, {
      email: 'product-comments-remove-writer@test.com',
      nickname: '댓글삭제작성자',
    });
    outsider = await createTestUser(app, {
      email: 'product-comments-remove-outsider@test.com',
      nickname: '댓글삭제제삼자',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('DELETE /product-comments/:id 작성자가 삭제하고 빈 응답과 DB 및 목록에서 제거 -> 204', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await deleteComment(comment.id, writer.accessToken).expect(204);

    expect(res.text).toBe('');
    expect(
      await prisma.productComment.findUnique({ where: { id: comment.id } }),
    ).toBeNull();
    const list = await request(app.getHttpServer())
      .get(`/products/${product.id}/comments`)
      .expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('DELETE /product-comments/:id 같은 상품의 다른 댓글과 상품 자체 유지 -> 204', async () => {
    const product = await createProduct();
    const target = await createComment(product.id);
    const other = await createComment(product.id, '남길 댓글', outsider.id);

    await deleteComment(target.id, writer.accessToken).expect(204);

    expect(
      await prisma.productComment.findUnique({ where: { id: target.id } }),
    ).toBeNull();
    await expectUnchanged(other);
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).toEqual(product);
    const list = await request(app.getHttpServer())
      .get(`/products/${product.id}/comments`)
      .expect(200);
    expect(list.body.items.map((item: { id: number }) => item.id)).toEqual([
      other.id,
    ]);
  });

  it('DELETE /product-comments/:id 같은 댓글을 두 번 삭제 -> 404', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    await deleteComment(comment.id, writer.accessToken).expect(204);
    const res = await deleteComment(comment.id, writer.accessToken).expect(404);

    expect(res.body.message).toBe('댓글을 찾을 수 없습니다.');
    expect(
      await prisma.productComment.findUnique({ where: { id: comment.id } }),
    ).toBeNull();
  });

  it('DELETE /product-comments/:id 제3자가 삭제 -> 403', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await deleteComment(comment.id, outsider.accessToken).expect(
      403,
    );

    expect(res.body.message).toBe('작성자만 삭제할 수 있습니다.');
    await expectUnchanged(comment);
  });

  it('DELETE /product-comments/:id 판매자가 자기 상품에 달린 남의 댓글 삭제 -> 403', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await deleteComment(comment.id, seller.accessToken).expect(403);

    expect(res.body.message).toBe('작성자만 삭제할 수 있습니다.');
    await expectUnchanged(comment);
  });

  it('DELETE /product-comments/:id 없는 댓글 -> 404', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    const res = await deleteComment(
      comment.id + 1000,
      outsider.accessToken,
    ).expect(404);

    expect(res.body.message).toBe('댓글을 찾을 수 없습니다.');
    await expectUnchanged(comment);
  });

  it('DELETE /product-comments/:id 토큰 없음 -> 401', async () => {
    const product = await createProduct();
    const comment = await createComment(product.id);

    await deleteComment(comment.id).expect(401);
    await expectUnchanged(comment);
  });

  it.each(['0', 'abc'])(
    'DELETE /product-comments/:id 잘못된 경로 id(%s) -> 400',
    async (id) => {
      const product = await createProduct();
      const comment = await createComment(product.id);

      await deleteComment(id, writer.accessToken).expect(400);
      await expectUnchanged(comment);
    },
  );
});
