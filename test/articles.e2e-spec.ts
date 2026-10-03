import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../src/common/guards/user-throttler.guard.js';

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // 테스트용 사용자 A(작성자), B(다른 사람)
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // POST /articles에 적용된 UserThrottlerGuard로 인해 연속 작성 테스트가 429로 실패하는 것을 방지
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // 게시글이 사용자를 참조하므로 게시글 → 사용자 순서로 삭제
    await prisma.article.deleteMany();
    await prisma.user.deleteMany();

    userA = await createUser('a@test.com', 'userA');
    userB = await createUser('b@test.com', 'userB');
  });

  beforeEach(async () => {
    await prisma.article.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /articles -> 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    expect(res.body).toMatchObject({
      title: '제목',
      content: '내용',
      writerId: userA.id,
    });
    expect(res.body.id).toEqual(expect.any(Number));
  });

  it('GET /articles -> 최신순', async () => {
    // 1. 게시글 A 만들기
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: 'A', content: 'a' });

    // 2. 게시글 B 만들기
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: 'B', content: 'b' });

    // 3. 목록 조회
    const res = await request(app.getHttpServer()).get('/articles').expect(200);

    // 4. 나중에 만든 B가 먼저 와야 함
    const titles = res.body.map((article: { title: string }) => article.title);
    expect(titles).toEqual(['B', 'A']);
  });

  it('POST /articles 빈 본문 -> 400', async () => {
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({})
      .expect(400);
  });

  it('GET /articles/:id 단건 조회 -> 200', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '단건', content: '조회' })
      .expect(201);

    // 방금 만든 글로 단건 조회
    const res = await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);

    expect(res.body).toEqual(created.body);
  });

  it('GET /articles/:id 존재하지 않는 글 -> 404', async () => {
    // 존재하지 않는 게시글 ID로 조회
    const res = await request(app.getHttpServer())
      .get(`/articles/99999`) // 존재하지 않는 ID
      .expect(404);

    expect(res.body).toMatchObject({ message: '게시글을 찾을 수 없습니다.' });
  });

  it('GET /articles/:id id가 숫자가 아닐때 -> 400', async () => {
    // 존재하지 않는 게시글 ID로 조회
    const res = await request(app.getHttpServer())
      .get(`/articles/abc`) // 존재하지 않는 ID
      .expect(400);

    expect(res.body.message).toEqual(
      'Validation failed (numeric string is expected)',
    );
  });

  it('PATCH /articles/:id 정상수정 -> 200', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 전 제목', content: '수정 전 내용' })
      .expect(201);

    // 게시글 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 된 제목', content: '수정 된 내용' })
      .expect(200);

    // 수정 된 게시글 확인
    expect(res.body).toMatchObject({
      id: created.body.id,
      title: '수정 된 제목',
      content: '수정 된 내용',
    });

    // 수정한 데이터가 DB에 제대로 반영되었는지 확인
    const updated = await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);

    expect(updated.body).toEqual(res.body);
  });

  it('PATCH /articles/:id 존재하지 않는 글 -> 404', async () => {
    // 존재하지 않는 게시글 ID로 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/99999`) // 존재하지 않는 ID
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 할 제목', content: '수정 할 내용' })
      .expect(404);

    expect(res.body).toMatchObject({
      message: '게시글을 찾을 수 없습니다.',
    });
  });

  it('PATCH /articles/:id 제목 빈값 -> 400', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 전 제목', content: '수정 전 내용' })
      .expect(201);

    // 게시글 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: null, content: '수정 된 내용' })
      .expect(400);

    expect(res.body.message).toContain('title must be a string');
  });

  it('DELETE /articles/:id 정상삭제 -> 204', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '삭제 전 제목', content: '삭제 전 내용' })
      .expect(201);

    // 게시글 삭제
    await request(app.getHttpServer())
      .delete(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(204);

    // 정말 지워졌는지 다시 조회
    await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(404);
  });

  it('DELETE /articles/:id 없는 id 삭제 -> 404', async () => {
    // 게시글 삭제
    const res = await request(app.getHttpServer())
      .delete(`/articles/99999`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);

    expect(res.body).toMatchObject({
      message: '게시글을 찾을 수 없습니다.',
    });
  });

  it('POST /articles 모르는 필드 입력 -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용', price: 1000 })
      .expect(400);

    expect(res.body.message).toContain('property price should not exist');
  });

  it('POST /articles 토큰 없음 -> 401', async () => {
    await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '제목', content: '내용' })
      .expect(401);
  });

  it('PATCH /articles/:id 본문 없음 -> 400', async () => {
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    // 본문 없이 요청 (Express 5에서 body가 undefined)
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(400);

    expect(res.body.message).toEqual('수정할 내용이 없습니다.');

    // 빈 객체도 400
    await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({})
      .expect(400);
  });

  it('PATCH /articles/:id 다른 사람 글 -> 403', async () => {
    // A가 작성
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    // B가 수정 시도
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ title: '남의 글 수정' })
      .expect(403);

    expect(res.body.message).toEqual('작성자만 수정할 수 있습니다.');

    // 실제로 바뀌지 않았는지 확인
    const after = await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);

    expect(after.body.title).toEqual('제목');
  });

  it('DELETE /articles/:id 다른 사람 글 -> 403', async () => {
    // A가 작성
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    // B가 삭제 시도
    const res = await request(app.getHttpServer())
      .delete(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);

    expect(res.body.message).toEqual('작성자만 삭제할 수 있습니다.');

    // 아직 남아 있는지 확인
    await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);
  });
});
