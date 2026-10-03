import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Throttle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userSeq = 0;

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

  // 테스트 간 throttler 횟수 격리를 위해 매번 새 사용자를 생성
  async function createUniqueUser() {
    userSeq += 1;
    return createUser(`throttle_${userSeq}@test.com`, `user${userSeq}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // 게시글이 사용자를 참조하므로 게시글 → 사용자 순서로 삭제
    await prisma.article.deleteMany();
    await prisma.user.deleteMany();
  });

  beforeEach(async () => {
    await prisma.article.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /articles 연속 2번 요청 -> 429', async () => {
    const user = await createUniqueUser();

    // 1번째 요청: 성공 (201)
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: '첫 번째 글', content: '첫 번째 내용' })
      .expect(201);

    // 2번째 요청: 10초 내 재요청이므로 제한 (429)
    const res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: '두 번째 글', content: '두 번째 내용' })
      .expect(429);

    expect(res.body.message).toEqual('ThrottlerException: Too Many Requests');
  });

  it('POST /articles 한 사용자가 429를 받은 직후 다른 사용자가 요청 -> 201', async () => {
    const userA = await createUniqueUser();
    const userB = await createUniqueUser();

    // 사용자 A가 1번째 요청 (201)
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: 'A의 첫 글', content: '내용' })
      .expect(201);

    // 사용자 A가 연속 2번째 요청하여 429 차단
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: 'A의 두 번째 글', content: '내용' })
      .expect(429);

    // 직후 사용자 B가 요청하면 사용자별 격리이므로 정상 생성 (201)
    const resB = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ title: 'B의 첫 글', content: '내용' })
      .expect(201);

    expect(resB.body).toMatchObject({
      title: 'B의 첫 글',
      content: '내용',
      writer: { id: userB.id },
    });
  });

  it('POST /articles 429 응답 시 게시글이 실제로 DB에 생성되지 않음 -> 429', async () => {
    const user = await createUniqueUser();

    // 1번째 요청: 정상 등록
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: '성공한 글', content: '내용' })
      .expect(201);

    const countBefore = await prisma.article.count({
      where: { writerId: user.id },
    });
    expect(countBefore).toBe(1);

    // 2번째 요청: 429 발생
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: '차단되어야 하는 글', content: '내용' })
      .expect(429);

    // 실제로 DB에 두 번째 글이 저장되지 않고 게시글 수가 1개인지 확인
    const countAfter = await prisma.article.count({
      where: { writerId: user.id },
    });
    expect(countAfter).toBe(1);

    const blockedArticle = await prisma.article.findFirst({
      where: { title: '차단되어야 하는 글' },
    });
    expect(blockedArticle).toBeNull();
  });

  it('POST /articles 토큰 없이 요청 시 JwtAuthGuard 우선 실행 -> 401', async () => {
    // 두 번 요청해도 401이어야 하며, 두 번째 요청까지 401이면 Throttler보다 인증 Guard가 먼저 실행된 것임
    const firstRes = await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '토큰 없는 글', content: '내용' })
      .expect(401);

    const secondRes = await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '토큰 없는 글', content: '내용' })
      .expect(401);

    expect(firstRes.body.message).toEqual('로그인이 필요합니다.');
    expect(secondRes.body.message).toEqual('로그인이 필요합니다.');
  });
});
