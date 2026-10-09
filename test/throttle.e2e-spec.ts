import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Throttle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let userSeq = 0;

  // 테스트 간 throttler 횟수 격리를 위해 매번 새 사용자를 생성
  async function createUniqueUser() {
    userSeq += 1;
    // 준비 단계에서 가입/로그인 제한 횟수를 소비하지 않도록 DB에 직접 만들고 토큰을 발급
    const user = await prisma.user.create({
      data: {
        email: `throttle_${userSeq}@test.com`,
        nickname: `u${userSeq}`,
        passwordHash: 'not-used-for-login',
      },
    });
    const accessToken = await jwtService.signAsync(
      { sub: user.id },
      {
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    return { id: user.id, accessToken };
  }

  // 게시글 작성 API의 Throttler를 소비하지 않도록 DB에 직접 준비
  async function createArticle(writerId: number) {
    return prisma.article.create({
      data: {
        title: '댓글 제한 테스트 게시글',
        content: '게시글 본문',
        writerId,
      },
    });
  }

  function postComment(
    articleId: number,
    user: { id: number; accessToken: string },
    content: string,
  ) {
    return request(app.getHttpServer())
      .post(`/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ content });
  }

  // 각 인증 제한 테스트에 새 Throttler 저장소를 제공해 테스트 간 횟수를 격리
  async function createAuthThrottleApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const authApp = moduleRef.createNestApplication();
    await authApp.init();
    return authApp;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

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

  it('POST /auth/sign-in 틀린 비밀번호 5회 후 6번째 요청 -> 401, 429', async () => {
    const authApp = await createAuthThrottleApp();
    try {
      userSeq += 1;
      await prisma.user.create({
        data: {
          email: `throttle_signin_${userSeq}@test.com`,
          nickname: `si${userSeq}`,
          passwordHash: await hash('correct-password', 10),
        },
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const res = await request(authApp.getHttpServer())
          .post('/auth/sign-in')
          .send({
            email: `throttle_signin_${userSeq}@test.com`,
            password: 'wrong-password',
          })
          .expect(401);

        expect(res.body.message).toEqual(
          '이메일 또는 비밀번호가 올바르지 않습니다.',
        );
      }

      const blocked = await request(authApp.getHttpServer())
        .post('/auth/sign-in')
        .send({
          email: `throttle_signin_${userSeq}@test.com`,
          password: 'wrong-password',
        })
        .expect(429);
      expect(blocked.body.message).toEqual(
        'ThrottlerException: Too Many Requests',
      );
    } finally {
      await authApp.close();
    }
  });

  it('POST /auth/sign-up 3회 후 4번째 요청 -> 201, 429', async () => {
    const authApp = await createAuthThrottleApp();
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        userSeq += 1;
        await request(authApp.getHttpServer())
          .post('/auth/sign-up')
          .send({
            email: `throttle_signup_${userSeq}@test.com`,
            nickname: `su${userSeq}`,
            password: 'password1234',
          })
          .expect(201);
      }

      userSeq += 1;
      const blocked = await request(authApp.getHttpServer())
        .post('/auth/sign-up')
        .send({
          email: `throttle_signup_${userSeq}@test.com`,
          nickname: `su${userSeq}`,
          password: 'password1234',
        })
        .expect(429);
      expect(blocked.body.message).toEqual(
        'ThrottlerException: Too Many Requests',
      );
    } finally {
      await authApp.close();
    }
  });

  it('POST /auth/sign-in 로그인 제한 직후 POST /auth/sign-up -> 회원가입은 201', async () => {
    const authApp = await createAuthThrottleApp();
    try {
      userSeq += 1;
      await prisma.user.create({
        data: {
          email: `throttle_independent_${userSeq}@test.com`,
          nickname: `iu${userSeq}`,
          passwordHash: await hash('correct-password', 10),
        },
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(authApp.getHttpServer())
          .post('/auth/sign-in')
          .send({
            email: `throttle_independent_${userSeq}@test.com`,
            password: 'wrong-password',
          })
          .expect(401);
      }
      await request(authApp.getHttpServer())
        .post('/auth/sign-in')
        .send({
          email: `throttle_independent_${userSeq}@test.com`,
          password: 'wrong-password',
        })
        .expect(429);

      // sign-in 제한을 다 쓴 직후에도 별도 라우트인 sign-up 카운터는 남아 있어 정상 처리
      await request(authApp.getHttpServer())
        .post('/auth/sign-up')
        .send({
          email: `throttle_independent_signup_${userSeq}@test.com`,
          nickname: `is${userSeq}`,
          password: 'password1234',
        })
        .expect(201);
    } finally {
      await authApp.close();
    }
  });

  it('POST /articles/:id/comments 같은 사용자가 3회 작성 후 4회째 -> 201, 429', async () => {
    const user = await createUniqueUser();
    const article = await createArticle(user.id);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await postComment(article.id, user, `댓글 ${attempt}`).expect(201);
    }

    const blocked = await postComment(article.id, user, '네 번째 댓글').expect(
      429,
    );
    expect(blocked.body.message).toEqual(
      'ThrottlerException: Too Many Requests',
    );
  });

  it('POST /articles/:id/comments 429 응답 댓글은 DB에 생성되지 않음 -> 429', async () => {
    const user = await createUniqueUser();
    const article = await createArticle(user.id);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await postComment(article.id, user, `저장되는 댓글 ${attempt}`).expect(
        201,
      );
    }

    await postComment(article.id, user, '저장되면 안 되는 네 번째 댓글').expect(
      429,
    );

    expect(
      await prisma.articleComment.count({
        where: {
          articleId: article.id,
          writerId: user.id,
          content: '저장되면 안 되는 네 번째 댓글',
        },
      }),
    ).toBe(0);
    expect(
      await prisma.articleComment.count({ where: { articleId: article.id } }),
    ).toBe(3);
  });

  it('POST /articles/:id/comments A가 제한된 직후 B가 같은 게시글에 작성 -> 201', async () => {
    const userA = await createUniqueUser();
    const userB = await createUniqueUser();
    const article = await createArticle(userA.id);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await postComment(article.id, userA, `A의 댓글 ${attempt}`).expect(201);
    }
    const blocked = await postComment(
      article.id,
      userA,
      'A의 차단 댓글',
    ).expect(429);
    expect(blocked.body.message).toEqual(
      'ThrottlerException: Too Many Requests',
    );

    const commentB = await postComment(article.id, userB, 'B의 첫 댓글').expect(
      201,
    );
    expect(commentB.body).toMatchObject({
      content: 'B의 첫 댓글',
      articleId: article.id,
      writer: { id: userB.id },
    });
  });

  it('POST /articles/:id/comments 댓글 제한 초과 후 POST /articles -> 201', async () => {
    const user = await createUniqueUser();
    const article = await createArticle(user.id);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await postComment(article.id, user, `댓글 ${attempt}`).expect(201);
    }
    await postComment(article.id, user, '차단되는 네 번째 댓글').expect(429);

    const createdArticle = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: '제한 분리 확인 글', content: '댓글 제한과 별개' })
      .expect(201);

    expect(createdArticle.body).toMatchObject({
      title: '제한 분리 확인 글',
      content: '댓글 제한과 별개',
      writer: { id: user.id },
    });
  });
});
