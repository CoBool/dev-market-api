import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ProductComment } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Product comments find all (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let user: { id: number; accessToken: string };

  async function createProduct() {
    return prisma.product.create({
      data: {
        name: '목록 대상 상품',
        description: '상품 설명',
        price: 1000,
        tags: ['test'],
        sellerId: user.id,
      },
    });
  }

  async function createComments(productId: number, contents: string[]) {
    const comments: ProductComment[] = [];
    for (const content of contents) {
      comments.push(
        await prisma.productComment.create({
          data: { content, productId, writerId: user.id },
        }),
      );
    }
    return comments;
  }

  function getCommentAt(
    comments: ProductComment[],
    index: number,
  ): ProductComment {
    const comment = comments[index];
    if (!comment) throw new Error(`댓글 fixture ${index}번 항목이 없습니다.`);
    return comment;
  }

  function getComments(
    productId: number,
    query?: Record<string, string | number>,
  ) {
    const req = request(app.getHttpServer()).get(
      `/products/${productId}/comments`,
    );
    return query ? req.query(query) : req;
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
    user = await createTestUser(app, {
      email: 'product-comments-list@test.com',
      nickname: '목록사용자',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /products/:id/comments 댓글 없는 상품 -> 빈 목록 200', async () => {
    const product = await createProduct();
    const res = await getComments(product.id).expect(200);
    expect(res.body).toEqual({ items: [], meta: { nextCursor: null } });
  });

  it('GET /products/:id/comments 댓글 5개 -> 최신순 200', async () => {
    const product = await createProduct();
    const comments = await createComments(product.id, [
      '댓글 1',
      '댓글 2',
      '댓글 3',
      '댓글 4',
      '댓글 5',
    ]);
    const res = await getComments(product.id).expect(200);
    expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
      comments.map((c) => c.id).reverse(),
    );
    expect(res.body.meta.nextCursor).toBeNull();
  });

  it('GET /products/:id/comments?limit=2 세 페이지 -> 최신순 중복과 누락 없이 200', async () => {
    const product = await createProduct();
    const comments = await createComments(product.id, [
      '댓글 1',
      '댓글 2',
      '댓글 3',
      '댓글 4',
      '댓글 5',
    ]);
    const newest = [...comments].reverse();
    const first = await getComments(product.id, { limit: 2 }).expect(200);
    expect(first.body.items.map((x: { id: number }) => x.id)).toEqual(
      newest.slice(0, 2).map((x) => x.id),
    );
    expect(first.body.meta.nextCursor).toBe(getCommentAt(newest, 1).id);
    const second = await getComments(product.id, {
      cursor: getCommentAt(newest, 1).id,
      limit: 2,
    }).expect(200);
    expect(second.body.items.map((x: { id: number }) => x.id)).toEqual(
      newest.slice(2, 4).map((x) => x.id),
    );
    expect(second.body.meta.nextCursor).toBe(getCommentAt(newest, 3).id);
    const third = await getComments(product.id, {
      cursor: getCommentAt(newest, 3).id,
      limit: 2,
    }).expect(200);
    expect(third.body.items.map((x: { id: number }) => x.id)).toEqual([
      getCommentAt(newest, 4).id,
    ]);
    expect(third.body.meta.nextCursor).toBeNull();
    const ids = [
      ...first.body.items,
      ...second.body.items,
      ...third.body.items,
    ].map((x: { id: number }) => x.id);
    expect(ids).toEqual(newest.map((x) => x.id));
    expect(new Set(ids).size).toBe(5);
  });

  it('GET /products/:id/comments?limit=2 남은 댓글이 정확히 limit개 -> nextCursor null 200', async () => {
    const product = await createProduct();
    const comments = await createComments(product.id, [
      '댓글 1',
      '댓글 2',
      '댓글 3',
      '댓글 4',
    ]);
    const newest = [...comments].reverse();
    const res = await getComments(product.id, {
      cursor: getCommentAt(newest, 1).id,
      limit: 2,
    }).expect(200);
    expect(res.body.items.map((x: { id: number }) => x.id)).toEqual(
      newest.slice(2).map((x) => x.id),
    );
    expect(res.body.meta.nextCursor).toBeNull();
  });

  it('GET /products/:id/comments?limit=2 다음 페이지 중 새 댓글 추가 -> 다음 페이지에는 없고 첫 페이지에 나옴 200', async () => {
    const product = await createProduct();
    const initial = await createComments(product.id, [
      '댓글 1',
      '댓글 2',
      '댓글 3',
    ]);
    const newest = [...initial].reverse();
    const first = await getComments(product.id, { limit: 2 }).expect(200);
    expect(first.body.meta.nextCursor).toBe(getCommentAt(newest, 1).id);
    const added = await prisma.productComment.create({
      data: {
        content: '나중에 추가',
        productId: product.id,
        writerId: user.id,
      },
    });
    const next = await getComments(product.id, {
      cursor: getCommentAt(newest, 1).id,
      limit: 2,
    }).expect(200);
    expect(next.body.items.map((x: { id: number }) => x.id)).toEqual([
      getCommentAt(newest, 2).id,
    ]);
    expect(next.body.meta.nextCursor).toBeNull();

    // 최신순이라 새 댓글은 cursor 없이 다시 조회해야 맨 앞에 보임
    const refreshed = await getComments(product.id, { limit: 2 }).expect(200);
    expect(refreshed.body.items.map((x: { id: number }) => x.id)).toEqual([
      added.id,
      getCommentAt(newest, 0).id,
    ]);
  });

  it('GET /products/:id/comments 삭제된 cursor로 다음 댓글 조회 -> 200', async () => {
    const product = await createProduct();
    const comments = await createComments(product.id, [
      '커서 댓글',
      '다음 댓글 1',
      '다음 댓글 2',
    ]);
    const cursor = getCommentAt(comments, 2).id;
    await prisma.productComment.delete({ where: { id: cursor } });
    const res = await getComments(product.id, { cursor }).expect(200);
    expect(res.body.items.map((x: { id: number }) => x.id)).toEqual([
      getCommentAt(comments, 1).id,
      getCommentAt(comments, 0).id,
    ]);
    expect(res.body.meta.nextCursor).toBeNull();
  });

  it('GET /products/:id/comments limit 생략 -> 기본 10개와 10번째 cursor 200', async () => {
    const product = await createProduct();
    const comments = await createComments(
      product.id,
      Array.from({ length: 11 }, (_, i) => `댓글 ${i + 1}`),
    );
    const newest = [...comments].reverse();
    const res = await getComments(product.id).expect(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.items.map((x: { id: number }) => x.id)).toEqual(
      newest.slice(0, 10).map((x) => x.id),
    );
    expect(res.body.meta.nextCursor).toBe(getCommentAt(newest, 9).id);
  });

  it('GET /products/:id/comments 다른 상품 댓글은 목록에서 제외 -> 200', async () => {
    const productA = await createProduct();
    const productB = await createProduct();
    await createComments(productA.id, ['A 댓글']);
    await createComments(productB.id, ['B 댓글']);
    const res = await getComments(productA.id).expect(200);
    expect(res.body.items.map((x: { content: string }) => x.content)).toEqual([
      'A 댓글',
    ]);
  });

  it('GET /products/:id/comments 응답 키 정확히 비교하고 writerId 제외 -> 200', async () => {
    const product = await createProduct();
    await createComments(product.id, ['작성자 포함']);
    const res = await getComments(product.id).expect(200);
    const item = res.body.items[0];
    expect(Object.keys(item).sort()).toEqual(
      ['id', 'content', 'createdAt', 'updatedAt', 'productId', 'writer'].sort(),
    );
    expect(item.writer).toEqual({ id: user.id, nickname: '목록사용자' });
    expect(item).not.toHaveProperty('writerId');
  });

  it('GET /products/:id/comments 토큰 없이 조회 -> 200', async () => {
    const product = await createProduct();
    await getComments(product.id).expect(200);
  });

  it('GET /products/:id/comments 없는 상품 -> 404', async () => {
    const res = await getComments(999999).expect(404);
    expect(res.body.message).toBe('상품을 찾을 수 없습니다.');
  });

  it.each([
    ['cursor 0', { cursor: 0 }],
    ['cursor 문자열', { cursor: 'abc' }],
    ['cursor 소수', { cursor: '1.5' }],
    ['cursor int32 초과', { cursor: '2147483648' }],
    ['limit 0', { limit: 0 }],
    ['limit 101', { limit: 101 }],
    ['limit 지수 표기', { limit: '1e1' }],
    ['limit 문자열', { limit: 'abc' }],
  ])(
    'GET /products/:id/comments 잘못된 쿼리(%s) -> 400',
    async (_name, query) => {
      const product = await createProduct();
      await getComments(product.id, query).expect(400);
    },
  );
});
