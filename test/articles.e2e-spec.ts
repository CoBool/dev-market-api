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
    const res = await request(app.getHttpServer())
      .get('/articles')
      .expect(200);

    // 4. 나중에 만든 B가 먼저 와야 함
    const titles = res.body.map((article: { title: string }) => article.title);
    expect(titles).toEqual(['B', 'A']);
  });

  it('POST /articles 빈 본문 -> 400', async () => {
    await request(app.getHttpServer()).post('/articles').send({}).expect(400);
  });
});
