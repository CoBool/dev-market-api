import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../src/common/guards/user-throttler.guard.js';
import type { ArticleComment } from '../src/generated/prisma/client.js';

describe('Article comments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // 댓글 작성 사용자 A와 다른 사용자 B
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  // 회원가입 + 로그인해서 id와 accessToken을 돌려줌
  async function createUser(email: string, nickname: string) {
    const password = 'password1234';

    const signUp = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ email, nickname, password })
      .expect(201);

    const signIn = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email, password })
      .expect(200);

    return {
      id: signUp.body.id as number,
      accessToken: signIn.body.accessToken as string,
    };
  }

  // API 호출 대신 DB에 댓글 대상 게시글을 준비
  async function createArticle() {
    return prisma.article.create({
      data: {
        title: '댓글 대상 게시글',
        content: '게시글 내용',
        writerId: userA.id,
      },
    });
  }

  // 페이지 테스트 fixture를 오래된 순서대로 만들어 생성된 id도 돌려줌
  async function createComments(
    articleId: number,
    contents: string[],
    writerId = userA.id,
  ) {
    const comments: ArticleComment[] = [];
    for (const content of contents) {
      comments.push(
        await prisma.articleComment.create({
          data: { content, articleId, writerId },
        }),
      );
    }
    return comments;
  }

  // 배열 길이를 벗어난 fixture 접근을 undefined로 흘려보내지 않고 즉시 알림
  function getCommentAt(
    comments: ArticleComment[],
    index: number,
  ): ArticleComment {
    const comment = comments[index];
    if (!comment) {
      throw new Error(`댓글 fixture ${index}번 항목이 없습니다.`);
    }
    return comment;
  }

  // 댓글 API로 생성하고 응답을 돌려줌
  async function createComment(
    articleId: number,
    content: string,
    user = userA,
  ) {
    return request(app.getHttpServer())
      .post(`/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ content })
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 게시글 생성 테스트의 준비 요청이 UserThrottlerGuard 횟수를 소비하지 않도록 비활성화
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // 게시글이 댓글과 사용자를 참조하므로 게시글 → 사용자 순서로 정리
    await prisma.article.deleteMany();
    await prisma.user.deleteMany();

    userA = await createUser('comments-a@test.com', 'commA');
    userB = await createUser('comments-b@test.com', 'commB');
  });

  beforeEach(async () => {
    // 게시글 삭제가 댓글을 CASCADE로 정리
    await prisma.article.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /articles/:id/comments 정상 작성 -> 201', async () => {
    const article = await createArticle();

    const res = await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ content: '좋은 게시글입니다.' })
      .expect(201);

    expect(res.body).toMatchObject({
      content: '좋은 게시글입니다.',
      articleId: article.id,
      writer: { id: userA.id, nickname: 'commA' },
    });
    expect(res.body.id).toEqual(expect.any(Number));
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body.updatedAt).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('writerId');

    const saved = await prisma.articleComment.findUnique({
      where: { id: res.body.id as number },
    });
    expect(saved?.writerId).toBe(userA.id);
    expect(saved?.articleId).toBe(article.id);
  });

  it('POST /articles/:id/comments content 앞뒤 공백 -> trim 후 응답과 DB에 저장 201', async () => {
    const article = await createArticle();

    const res = await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ content: '  공백을 제거합니다.  ' })
      .expect(201);

    expect(res.body.content).toBe('공백을 제거합니다.');

    const saved = await prisma.articleComment.findUnique({
      where: { id: res.body.id as number },
    });
    expect(saved?.content).toBe('공백을 제거합니다.');
  });

  it('POST /articles/:id/comments content 정확히 500자 -> 201', async () => {
    const article = await createArticle();
    const content = '가'.repeat(500);

    const res = await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ content })
      .expect(201);

    expect(res.body.content).toBe(content);
  });

  it('POST /articles/:id/comments content 501자 -> 400', async () => {
    const article = await createArticle();

    await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ content: '가'.repeat(501) })
      .expect(400);
  });

  it('POST /articles/:id/comments 토큰 없음 -> 401', async () => {
    const article = await createArticle();

    const res = await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .send({ content: '로그인하지 않은 댓글' })
      .expect(401);

    expect(res.body.message).toEqual('로그인이 필요합니다.');
  });

  it('POST /articles/:id/comments 없는 게시글 -> 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/articles/999999/comments')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ content: '존재하지 않는 게시글의 댓글' })
      .expect(404);

    expect(res.body.message).toEqual('게시글을 찾을 수 없습니다.');
    expect(await prisma.articleComment.count()).toBe(0);
  });

  it.each([
    ['content 누락', {}],
    ['빈 문자열', { content: '' }],
    ['공백만 입력', { content: '   ' }],
    ['숫자 입력', { content: 123 }],
    ['null 입력', { content: null }],
    ['writerId 위조 필드', { content: '댓글', writerId: 999999 }],
    ['articleId 추가 필드', { content: '댓글', articleId: 999999 }],
  ])(
    'POST /articles/:id/comments 잘못된 본문(%s) -> 400',
    async (_name, body) => {
      const article = await createArticle();

      await request(app.getHttpServer())
        .post(`/articles/${article.id}/comments`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send(body)
        .expect(400);
    },
  );

  it.each([
    ['문자열', 'abc'],
    ['0', '0'],
    ['소수', '1.5'],
    ['int32 초과', '2147483648'],
  ])(
    'POST /articles/:id/comments 잘못된 경로 id(%s) -> 400',
    async (_name, id) => {
      await request(app.getHttpServer())
        .post(`/articles/${id}/comments`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ content: '경로 검증 댓글' })
        .expect(400);
    },
  );

  it('DELETE /articles/:id 댓글이 있는 게시글 삭제 -> 댓글도 CASCADE 삭제 204', async () => {
    const article = await createArticle();
    const comment = await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ content: '게시글과 함께 삭제될 댓글' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/articles/${article.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(204);

    expect(
      await prisma.articleComment.findUnique({
        where: { id: comment.body.id as number },
      }),
    ).toBeNull();
  });

  it('POST /articles/:id/comments 다른 사용자가 남의 게시글에 작성 -> 201', async () => {
    const article = await createArticle();

    const res = await request(app.getHttpServer())
      .post(`/articles/${article.id}/comments`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ content: '다른 사용자도 댓글을 작성할 수 있습니다.' })
      .expect(201);

    expect(res.body).toMatchObject({
      content: '다른 사용자도 댓글을 작성할 수 있습니다.',
      articleId: article.id,
      writer: { id: userB.id, nickname: 'commB' },
    });
    expect(res.body).not.toHaveProperty('writerId');
  });

  describe('GET /articles/:id/comments', () => {
    it('GET /articles/:id/comments 댓글 없는 게시글 -> 빈 목록과 nextCursor null 200', async () => {
      const article = await createArticle();

      const res = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta).toEqual({ nextCursor: null });
    });

    it('GET /articles/:id/comments 댓글 5개 조회 -> 모두 오래된순 200', async () => {
      const article = await createArticle();
      await createComments(article.id, [
        '첫 번째 댓글',
        '두 번째 댓글',
        '세 번째 댓글',
        '네 번째 댓글',
        '다섯 번째 댓글',
      ]);

      const res = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .expect(200);

      expect(
        res.body.items.map((item: { content: string }) => item.content),
      ).toEqual([
        '첫 번째 댓글',
        '두 번째 댓글',
        '세 번째 댓글',
        '네 번째 댓글',
        '다섯 번째 댓글',
      ]);
      expect(res.body.meta.nextCursor).toBeNull();
    });

    it('GET /articles/:id/comments?limit=2 세 페이지 조회 -> 순서대로 중복 없이 200', async () => {
      const article = await createArticle();
      const comments = await createComments(article.id, [
        '페이지 댓글 1',
        '페이지 댓글 2',
        '페이지 댓글 3',
        '페이지 댓글 4',
        '페이지 댓글 5',
      ]);

      const first = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ limit: 2 })
        .expect(200);
      expect(first.body.items.map((item: { id: number }) => item.id)).toEqual([
        getCommentAt(comments, 0).id,
        getCommentAt(comments, 1).id,
      ]);
      expect(first.body.meta.nextCursor).toBe(getCommentAt(comments, 1).id);

      const second = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ cursor: getCommentAt(comments, 1).id, limit: 2 })
        .expect(200);
      expect(second.body.items.map((item: { id: number }) => item.id)).toEqual([
        getCommentAt(comments, 2).id,
        getCommentAt(comments, 3).id,
      ]);
      expect(second.body.meta.nextCursor).toBe(getCommentAt(comments, 3).id);

      const third = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ cursor: getCommentAt(comments, 3).id, limit: 2 })
        .expect(200);
      expect(third.body.items.map((item: { id: number }) => item.id)).toEqual([
        getCommentAt(comments, 4).id,
      ]);
      expect(third.body.meta.nextCursor).toBeNull();

      const combinedIds = [
        ...first.body.items.map((item: { id: number }) => item.id),
        ...second.body.items.map((item: { id: number }) => item.id),
        ...third.body.items.map((item: { id: number }) => item.id),
      ];
      expect(combinedIds).toEqual(comments.map((comment) => comment.id));
      expect(new Set(combinedIds).size).toBe(5);
    });

    it('GET /articles/:id/comments?limit=2 정확히 limit개 남음 -> nextCursor null 200', async () => {
      const article = await createArticle();
      const comments = await createComments(article.id, [
        '경계 댓글 1',
        '경계 댓글 2',
        '경계 댓글 3',
        '경계 댓글 4',
      ]);

      const res = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ cursor: getCommentAt(comments, 1).id, limit: 2 })
        .expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual([
        getCommentAt(comments, 2).id,
        getCommentAt(comments, 3).id,
      ]);
      expect(res.body.meta.nextCursor).toBeNull();
    });

    it('GET /articles/:id/comments?limit=2 다음 페이지 조회 중 새 댓글 추가 -> 마지막 페이지에 포함 200', async () => {
      const article = await createArticle();
      const initial = await createComments(article.id, [
        '처음 댓글 1',
        '처음 댓글 2',
        '처음 댓글 3',
      ]);

      const first = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ limit: 2 })
        .expect(200);
      expect(first.body.meta.nextCursor).toBe(getCommentAt(initial, 1).id);

      const added = await prisma.articleComment.create({
        data: {
          content: '페이지 조회 중 추가된 댓글',
          articleId: article.id,
          writerId: userA.id,
        },
      });
      const last = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ cursor: getCommentAt(initial, 1).id, limit: 2 })
        .expect(200);

      expect(
        last.body.items.map((item: { id: number; content: string }) => ({
          id: item.id,
          content: item.content,
        })),
      ).toEqual([
        { id: getCommentAt(initial, 2).id, content: '처음 댓글 3' },
        { id: added.id, content: '페이지 조회 중 추가된 댓글' },
      ]);
      expect(last.body.meta.nextCursor).toBeNull();
    });

    it('GET /articles/:id/comments?cursor=삭제된 댓글 id cursor 행 삭제 후에도 다음 댓글 조회 -> 200', async () => {
      const article = await createArticle();
      const comments = await createComments(article.id, [
        '삭제된 커서 댓글',
        '커서 다음 댓글 1',
        '커서 다음 댓글 2',
      ]);
      await prisma.articleComment.delete({
        where: { id: getCommentAt(comments, 0).id },
      });

      const res = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .query({ cursor: getCommentAt(comments, 0).id })
        .expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual([
        getCommentAt(comments, 1).id,
        getCommentAt(comments, 2).id,
      ]);
      expect(res.body.meta.nextCursor).toBeNull();
    });

    it('GET /articles/:id/comments 다른 게시글 댓글은 목록에서 제외 -> 200', async () => {
      const articleA = await createArticle();
      const articleB = await prisma.article.create({
        data: {
          title: '다른 게시글',
          content: '다른 게시글 내용',
          writerId: userA.id,
        },
      });
      await createComments(articleA.id, ['A의 댓글 1', 'A의 댓글 2']);
      await createComments(articleB.id, ['B의 댓글']);

      const res = await request(app.getHttpServer())
        .get(`/articles/${articleA.id}/comments`)
        .expect(200);

      expect(
        res.body.items.map((item: { content: string }) => item.content),
      ).toEqual(['A의 댓글 1', 'A의 댓글 2']);
    });

    it('GET /articles/:id/comments 응답 작성자 포함 및 writerId 제외 -> 200', async () => {
      const article = await createArticle();
      await createComments(article.id, ['작성자 포함 댓글'], userB.id);

      const res = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .expect(200);

      expect(res.body.items[0]).toMatchObject({
        content: '작성자 포함 댓글',
        writer: { id: userB.id, nickname: 'commB' },
      });
      expect(res.body.items[0]).not.toHaveProperty('writerId');
    });

    it('GET /articles/:id/comments 토큰 없이 조회 -> 200', async () => {
      const article = await createArticle();

      await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .expect(200);
    });

    it('GET /articles/:id/comments 없는 게시글 -> 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/articles/999999/comments')
        .expect(404);

      expect(res.body.message).toEqual('게시글을 찾을 수 없습니다.');
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
      'GET /articles/:id/comments 잘못된 쿼리(%s) -> 400',
      async (_name, query) => {
        const article = await createArticle();

        await request(app.getHttpServer())
          .get(`/articles/${article.id}/comments`)
          .query(query)
          .expect(400);
      },
    );
  });

  describe('PATCH /article-comments/:id', () => {
    it('PATCH /article-comments/:id 작성자가 수정 -> 내용과 작성자 유지 200', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '수정 전 댓글');

      const res = await request(app.getHttpServer())
        .patch(`/article-comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ content: '수정 후 댓글' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: comment.body.id,
        content: '수정 후 댓글',
        articleId: article.id,
        writer: { id: userA.id, nickname: 'commA' },
      });
      expect(res.body).not.toHaveProperty('writerId');

      const saved = await prisma.articleComment.findUnique({
        where: { id: comment.body.id as number },
      });
      expect(saved?.content).toBe('수정 후 댓글');
      expect(saved?.writerId).toBe(userA.id);
    });

    it('PATCH /article-comments/:id content 앞뒤 공백 -> trim 후 저장 200', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '수정 전');

      const res = await request(app.getHttpServer())
        .patch(`/article-comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ content: '  공백이 제거된 수정 내용  ' })
        .expect(200);

      expect(res.body.content).toBe('공백이 제거된 수정 내용');
      const saved = await prisma.articleComment.findUnique({
        where: { id: comment.body.id as number },
      });
      expect(saved?.content).toBe('공백이 제거된 수정 내용');
    });

    it('PATCH /article-comments/:id 다른 사용자가 수정 -> 403', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '원래 댓글');

      const res = await request(app.getHttpServer())
        .patch(`/article-comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send({ content: '수정하면 안 되는 내용' })
        .expect(403);

      expect(res.body.message).toEqual('작성자만 수정할 수 있습니다.');
      const saved = await prisma.articleComment.findUnique({
        where: { id: comment.body.id as number },
      });
      expect(saved?.content).toBe('원래 댓글');
    });

    it('PATCH /article-comments/:id 없는 댓글 -> 404', async () => {
      const res = await request(app.getHttpServer())
        .patch('/article-comments/999999')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ content: '수정 내용' })
        .expect(404);

      expect(res.body.message).toEqual('댓글을 찾을 수 없습니다.');
    });

    it('PATCH /article-comments/:id 토큰 없음 -> 401', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '인증이 필요한 댓글');

      const res = await request(app.getHttpServer())
        .patch(`/article-comments/${comment.body.id}`)
        .send({ content: '수정 내용' })
        .expect(401);

      expect(res.body.message).toEqual('로그인이 필요합니다.');
    });

    it.each([
      ['content 누락', {}],
      ['공백만 입력', { content: '   ' }],
      ['숫자 입력', { content: 123 }],
      ['501자 입력', { content: '가'.repeat(501) }],
      ['writerId 위조 필드', { content: '수정 내용', writerId: 999999 }],
    ])(
      'PATCH /article-comments/:id 잘못된 본문(%s) -> 400',
      async (_name, body) => {
        await request(app.getHttpServer())
          .patch('/article-comments/1')
          .set('Authorization', `Bearer ${userA.accessToken}`)
          .send(body)
          .expect(400);
      },
    );

    it.each([
      ['문자열', 'abc'],
      ['0', '0'],
      ['소수', '1.5'],
    ])(
      'PATCH /article-comments/:id 잘못된 경로 id(%s) -> 400',
      async (_name, id) => {
        await request(app.getHttpServer())
          .patch(`/article-comments/${id}`)
          .set('Authorization', `Bearer ${userA.accessToken}`)
          .send({ content: '수정 내용' })
          .expect(400);
      },
    );
  });

  describe('DELETE /article-comments/:id', () => {
    it('DELETE /article-comments/:id 작성자가 삭제 -> DB와 목록에서 제거 204', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '삭제할 댓글');

      await request(app.getHttpServer())
        .delete(`/article-comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(204);

      expect(
        await prisma.articleComment.findUnique({
          where: { id: comment.body.id as number },
        }),
      ).toBeNull();
      const list = await request(app.getHttpServer())
        .get(`/articles/${article.id}/comments`)
        .expect(200);
      expect(list.body.items).toEqual([]);
    });

    it('DELETE /article-comments/:id 다른 사용자가 삭제 -> 403', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '남아 있어야 하는 댓글');

      const res = await request(app.getHttpServer())
        .delete(`/article-comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .expect(403);

      expect(res.body.message).toEqual('작성자만 삭제할 수 있습니다.');
      expect(
        await prisma.articleComment.findUnique({
          where: { id: comment.body.id as number },
        }),
      ).not.toBeNull();
    });

    it('DELETE /article-comments/:id 없는 댓글 -> 404', async () => {
      const res = await request(app.getHttpServer())
        .delete('/article-comments/999999')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(404);

      expect(res.body.message).toEqual('댓글을 찾을 수 없습니다.');
    });

    it('DELETE /article-comments/:id 토큰 없음 -> 401', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '인증이 필요한 삭제');

      const res = await request(app.getHttpServer())
        .delete(`/article-comments/${comment.body.id}`)
        .expect(401);

      expect(res.body.message).toEqual('로그인이 필요합니다.');
    });

    it('DELETE /article-comments/:id 이미 삭제한 댓글 -> 404', async () => {
      const article = await createArticle();
      const comment = await createComment(article.id, '두 번 삭제할 댓글');
      const path = `/article-comments/${comment.body.id}`;

      await request(app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(404);
      expect(res.body.message).toEqual('댓글을 찾을 수 없습니다.');
    });
  });
});
