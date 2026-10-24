import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './helpers/db.js';
import { createTestUser } from './helpers/users.js';

describe('Article likes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let writer: { id: number; accessToken: string };
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };
  let userC: { id: number; accessToken: string };

  async function createArticle(writerId = writer.id) {
    return prisma.article.create({
      data: {
        title: '좋아요 테스트 글',
        content: '좋아요 API 테스트 내용',
        writerId,
      },
    });
  }

  function likeRequest(
    method: 'get' | 'put' | 'delete',
    id: string | number,
    token?: string,
  ) {
    const req = request(app.getHttpServer())[method](
      `/articles/${encodeURIComponent(String(id))}/like`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  }

  const getLike = (id: string | number, token?: string) =>
    likeRequest('get', id, token);
  const putLike = (id: string | number, token?: string) =>
    likeRequest('put', id, token);
  const deleteLike = (id: string | number, token?: string) =>
    likeRequest('delete', id, token);

  function expectStatus(res: { body: Record<string, unknown> }) {
    expect(Object.keys(res.body).sort()).toEqual(
      ['articleId', 'isLiked', 'likeCount'].sort(),
    );
  }

  async function likeRows(articleId: number) {
    return prisma.articleLike.count({ where: { articleId } });
  }

  async function expectCount(articleId: number, count: number) {
    const article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
    });
    expect(article.likeCount).toBe(count);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    // 동시 요청 중 supertest가 서버를 직접 열고 닫아 연결이 끊기지 않도록 미리 연다
    await app.listen(0);
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    writer = await createTestUser(app, {
      email: 'like-writer@test.com',
      nickname: '좋아요작성자',
    });
    userA = await createTestUser(app, {
      email: 'like-user-a@test.com',
      nickname: '좋아요사용자A',
    });
    userB = await createTestUser(app, {
      email: 'like-user-b@test.com',
      nickname: '좋아요사용자B',
    });
    userC = await createTestUser(app, {
      email: 'like-user-c@test.com',
      nickname: '좋아요사용자C',
    });
  });

  beforeEach(async () => {
    await prisma.article.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('인증과 검증', () => {
    it.each(['GET', 'PUT', 'DELETE'] as const)(
      '%s /articles/:id/like 토큰 없음 -> 401',
      async (method) => {
        const article = await createArticle();
        const req = likeRequest(
          method.toLowerCase() as 'get' | 'put' | 'delete',
          article.id,
        );
        await req.expect(401);
        expect(await likeRows(article.id)).toBe(0);
        await expectCount(article.id, 0);
      },
    );

    it.each(['GET', 'PUT', 'DELETE'] as const)(
      '%s /articles/:id/like 없는 글 -> 404',
      async (method) => {
        const article = await createArticle();
        const missingId = article.id + 1000;
        const req = likeRequest(
          method.toLowerCase() as 'get' | 'put' | 'delete',
          missingId,
          userA.accessToken,
        );
        const res = await req.expect(404);
        expect(res.body.message).toBe('게시글을 찾을 수 없습니다.');
        expect(await likeRows(article.id)).toBe(0);
        await expectCount(article.id, 0);
      },
    );

    it.each(['GET', 'PUT', 'DELETE'] as const)(
      '%s /articles/:id/like 잘못된 id -> 400',
      async (method) => {
        const article = await createArticle();
        for (const id of ['abc', '0', '-1']) {
          await likeRequest(
            method.toLowerCase() as 'get' | 'put' | 'delete',
            id,
            userA.accessToken,
          ).expect(400);
        }
        expect(await likeRows(article.id)).toBe(0);
        await expectCount(article.id, 0);
      },
    );
  });

  describe('GET /articles/:id/like', () => {
    it('GET /articles/:id/like 좋아요하지 않은 글 -> false, 200', async () => {
      const article = await createArticle();
      const res = await getLike(article.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: false,
        likeCount: 0,
      });
    });

    it('GET /articles/:id/like 내가 좋아요한 글 -> true, 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const res = await getLike(article.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: true,
        likeCount: 1,
      });
    });

    it('GET /articles/:id/like 다른 사용자만 좋아요한 글 -> 내 좋아요 여부 false, 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userB.accessToken).expect(200);
      await putLike(article.id, userC.accessToken).expect(200);
      const res = await getLike(article.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: false,
        likeCount: 2,
      });
    });
  });

  describe('PUT /articles/:id/like', () => {
    it('PUT /articles/:id/like 처음 좋아요 -> true와 DB에 한 행, 200', async () => {
      const article = await createArticle();
      const res = await putLike(article.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: true,
        likeCount: 1,
      });
      expect(await likeRows(article.id)).toBe(1);
      await expectCount(article.id, 1);
    });

    it('PUT /articles/:id/like 같은 사용자가 두 번 좋아요 -> 카운트 유지, 200', async () => {
      const article = await createArticle();
      const first = await putLike(article.id, userA.accessToken).expect(200);
      const second = await putLike(article.id, userA.accessToken).expect(200);
      expectStatus(first);
      expectStatus(second);
      expect(first.body.likeCount).toBe(1);
      expect(second.body).toEqual({
        articleId: article.id,
        isLiked: true,
        likeCount: 1,
      });
      expect(await likeRows(article.id)).toBe(1);
      await expectCount(article.id, 1);
    });

    it('PUT /articles/:id/like 자기 글도 좋아요 가능 -> 200', async () => {
      const article = await createArticle(writer.id);
      const res = await putLike(article.id, writer.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: true,
        likeCount: 1,
      });
      expect(await likeRows(article.id)).toBe(1);
    });

    it('PUT /articles/:id/like 다른 사용자 두 명이 좋아요 -> likeCount 2, 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const res = await putLike(article.id, userB.accessToken).expect(200);
      expectStatus(res);
      expect(res.body.likeCount).toBe(2);
      expect(await likeRows(article.id)).toBe(2);
      await expectCount(article.id, 2);
    });
  });

  describe('DELETE /articles/:id/like', () => {
    it('DELETE /articles/:id/like 좋아요한 글 취소 -> false와 카운트 0, 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const res = await deleteLike(article.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: false,
        likeCount: 0,
      });
      expect(await likeRows(article.id)).toBe(0);
      await expectCount(article.id, 0);
    });

    it('DELETE /articles/:id/like 좋아요하지 않은 글 취소 -> 상태 유지, 200', async () => {
      const article = await createArticle();
      const res = await deleteLike(article.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: false,
        likeCount: 0,
      });
      expect(await likeRows(article.id)).toBe(0);
      await expectCount(article.id, 0);
    });

    it('DELETE /articles/:id/like 다른 사용자 세 명의 좋아요는 유지 -> 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      await putLike(article.id, userB.accessToken).expect(200);
      await putLike(article.id, userC.accessToken).expect(200);
      const res = await deleteLike(article.id, writer.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        articleId: article.id,
        isLiked: false,
        likeCount: 3,
      });
      expect(await likeRows(article.id)).toBe(3);
      await expectCount(article.id, 3);
    });

    it('DELETE /articles/:id/like 같은 사용자가 두 번 취소 -> 카운트 0 유지, 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const first = await deleteLike(article.id, userA.accessToken).expect(200);
      const second = await deleteLike(article.id, userA.accessToken).expect(
        200,
      );
      expectStatus(first);
      expectStatus(second);
      expect(first.body.likeCount).toBe(0);
      expect(second.body).toEqual({
        articleId: article.id,
        isLiked: false,
        likeCount: 0,
      });
      expect(await likeRows(article.id)).toBe(0);
      await expectCount(article.id, 0);
    });
  });

  describe('updatedAt', () => {
    it('PUT /articles/:id/like 좋아요 후 글 updatedAt 유지 -> 200', async () => {
      const article = await createArticle();
      const before = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await putLike(article.id, userA.accessToken).expect(200);
      const detail = await request(app.getHttpServer())
        .get(`/articles/${article.id}`)
        .expect(200);
      const after = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
      });
      expect(detail.body.updatedAt).toBe(before.updatedAt.toISOString());
      expect(after.updatedAt.toISOString()).toBe(
        before.updatedAt.toISOString(),
      );
    });

    it('DELETE /articles/:id/like 취소 후 글 updatedAt 유지 -> 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const before = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await deleteLike(article.id, userA.accessToken).expect(200);
      const detail = await request(app.getHttpServer())
        .get(`/articles/${article.id}`)
        .expect(200);
      const after = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
      });
      expect(detail.body.updatedAt).toBe(before.updatedAt.toISOString());
      expect(after.updatedAt.toISOString()).toBe(
        before.updatedAt.toISOString(),
      );
    });

    it('PATCH /articles/:id 좋아요 후 글 수정 시 updatedAt 갱신 -> 200', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const before = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const res = await request(app.getHttpServer())
        .patch(`/articles/${article.id}`)
        .set('Authorization', `Bearer ${writer.accessToken}`)
        .send({ title: '좋아요 후 수정한 글' })
        .expect(200);
      const after = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
      });
      expect(new Date(res.body.updatedAt).toISOString()).not.toBe(
        before.updatedAt.toISOString(),
      );
      expect(after.updatedAt.toISOString()).toBe(res.body.updatedAt);
    });
  });

  describe('동시 요청', () => {
    it('PUT /articles/:id/like 서로 다른 사용자 열 명이 동시에 좋아요 5회 -> 매회 10개', async () => {
      for (let round = 1; round <= 5; round += 1) {
        const article = await createArticle();
        const users = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            createTestUser(app, {
              email: `like-concurrent-${round}-${index}@test.com`,
              nickname: `동시${round}${index}`,
            }),
          ),
        );
        const responses = await Promise.all(
          users.map((user) => putLike(article.id, user.accessToken)),
        );
        responses.forEach(expectStatus);
        expect(
          responses.map((res) => res.status),
          `회차 ${round}`,
        ).toEqual(Array(10).fill(200));
        expect(await likeRows(article.id), `회차 ${round} 좋아요 행 수`).toBe(
          10,
        );
        await expectCount(article.id, 10);
      }
    });

    it('PUT /articles/:id/like 같은 사용자가 동시에 다섯 번 좋아요 -> 행 한 개', async () => {
      const article = await createArticle();
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => putLike(article.id, userA.accessToken)),
      );
      responses.forEach(expectStatus);
      expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
      expect(await likeRows(article.id)).toBe(1);
      await expectCount(article.id, 1);
    });

    it('DELETE /articles/:id/like 같은 사용자가 동시에 다섯 번 취소 -> 행 없음', async () => {
      const article = await createArticle();
      await putLike(article.id, userA.accessToken).expect(200);
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          deleteLike(article.id, userA.accessToken),
        ),
      );
      responses.forEach(expectStatus);
      expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
      expect(await likeRows(article.id)).toBe(0);
      await expectCount(article.id, 0);
    });
  });

  it('DELETE /articles/:id 좋아요가 있는 글을 작성자가 삭제 -> 204, 좋아요 행 Cascade 삭제', async () => {
    const article = await createArticle();
    await putLike(article.id, userA.accessToken).expect(200);
    await putLike(article.id, userB.accessToken).expect(200);

    const res = await request(app.getHttpServer())
      .delete(`/articles/${article.id}`)
      .set('Authorization', `Bearer ${writer.accessToken}`)
      .expect(204);

    expect(res.text).toBe('');
    expect(await likeRows(article.id)).toBe(0);
    expect(
      await prisma.article.findUnique({ where: { id: article.id } }),
    ).toBeNull();
  });
});
