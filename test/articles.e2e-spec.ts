import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
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
      .send({ title: '제목', content: '내용' })
      .expect(201);

    expect(res.body).toMatchObject({ title: '제목', content: '내용' });
    expect(res.body.id).toEqual(expect.any(Number));
  });

  it('GET /articles -> 최신순', async () => {
    // 1. 게시글 A 만들기
    await request(app.getHttpServer())
      .post('/articles')
      .send({ title: 'A', content: 'a' });

    // 2. 게시글 B 만들기
    await request(app.getHttpServer())
      .post('/articles')
      .send({ title: 'B', content: 'b' });

    // 3. 목록 조회
    const res = await request(app.getHttpServer()).get('/articles').expect(200);

    // 4. 나중에 만든 B가 먼저 와야 함
    const titles = res.body.map((article: { title: string }) => article.title);
    expect(titles).toEqual(['B', 'A']);
  });

  it('POST /articles 빈 본문 -> 400', async () => {
    await request(app.getHttpServer()).post('/articles').send({}).expect(400);
  });

  it('GET /articles/:id 단건 조회 -> 200', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
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
      .send({ title: '수정 전 제목', content: '수정 전 내용' })
      .expect(201);

    // 게시글 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
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
      .send({ title: '수정 할 제목', content: '수정 할 내용' })
      .expect(404);

    expect(res.body).toMatchObject({ message: '게시글을 찾을 수 없습니다.' });
  });

  it('PATCH /articles/:id 제목 빈값 -> 400', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '수정 전 제목', content: '수정 전 내용' })
      .expect(201);

    // 게시글 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .send({ title: null, content: '수정 된 내용' })
      .expect(400);

    expect(res.body.message).toContain('title must be a string');
  });

  it('DELETE /articles/:id 정상삭제 -> 204', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '삭제 전 제목', content: '삭제 전 내용' })
      .expect(201);

    // 게시글 삭제
    await request(app.getHttpServer())
      .delete(`/articles/${created.body.id}`)
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
      .expect(404);

    expect(res.body).toMatchObject({ message: '게시글을 찾을 수 없습니다.' });
  });

  it('POST /articles 모르는 필드 입력 -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '제목', content: '내용', price: 1000 })
      .expect(400);

    expect(res.body.message).toContain('property price should not exist');
  });
});
