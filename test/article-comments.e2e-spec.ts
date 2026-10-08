import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../src/common/guards/user-throttler.guard.js';

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

    userA = await createUser('comments-a@test.com', 'commentUserA');
    userB = await createUser('comments-b@test.com', 'commentUserB');
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
      writer: { id: userA.id, nickname: 'commentUserA' },
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
      writer: { id: userB.id, nickname: 'commentUserB' },
    });
    expect(res.body).not.toHaveProperty('writerId');
  });
});
