import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../src/common/guards/user-throttler.guard.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const user = {
    email: 'auth@test.com',
    nickname: 'authUser',
    password: 'password1234',
  };

  // 회원가입 + 로그인해서 id와 토큰들을 돌려줌
  async function signUpAndSignIn() {
    const signUp = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send(user)
      .expect(201);

    const signIn = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email: user.email, password: user.password })
      .expect(200);

    return {
      id: signUp.body.id as number,
      accessToken: signIn.body.accessToken as string,
      refreshToken: signIn.body.refreshToken as string,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 이 파일은 인증 동작을 검증하므로 요청 제한 횟수가 테스트에 영향을 주지 않게 비활성화
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    // 게시글이 사용자를 참조하므로 게시글 → 사용자 순서로 삭제
    await prisma.article.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/sign-up', () => {
    it('POST /auth/sign-up 정상 -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(user)
        .expect(201);

      expect(res.body).toMatchObject({
        email: user.email,
        nickname: user.nickname,
        image: null,
      });
      expect(res.body.id).toEqual(expect.any(Number));

      // 비밀번호(해시)는 응답에 없어야 함
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
    });

    it('POST /auth/sign-up 비밀번호는 해시로 저장 -> DB 확인', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(user)
        .expect(201);

      const saved = await prisma.user.findUnique({
        where: { email: user.email },
      });

      expect(saved?.passwordHash).not.toEqual(user.password);
      expect(saved?.passwordHash).toMatch(/^\$2[aby]\$10\$/); // bcrypt, cost 10
    });

    it('POST /auth/sign-up 이메일 중복 -> 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(user)
        .expect(201);

      // 같은 이메일, 다른 닉네임
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, nickname: 'other' })
        .expect(409);

      expect(res.body.message).toEqual('이미 사용중인 값입니다.');
    });

    it('POST /auth/sign-up 대문자 이메일 -> 소문자로 응답 및 저장 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: 'Case@Test.com' })
        .expect(201);

      expect(res.body.email).toEqual('case@test.com');

      const saved = await prisma.user.findUnique({
        where: { email: 'case@test.com' },
      });
      expect(saved?.email).toEqual('case@test.com');
    });

    it('POST /auth/sign-up 대소문자만 다른 이메일 재가입 -> 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: 'Case@Test.com' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: 'CASE@test.com', nickname: 'otherNickname' })
        .expect(409);

      expect(res.body.message).toEqual('이미 사용중인 값입니다.');
    });

    it('POST /auth/sign-up 이메일 앞뒤 공백 -> 공백 없이 저장 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: '  Space@Test.com  ' })
        .expect(201);

      expect(res.body.email).toEqual('space@test.com');

      const saved = await prisma.user.findUnique({
        where: { email: 'space@test.com' },
      });
      expect(saved?.email).toEqual('space@test.com');
    });

    it('POST /auth/sign-up 닉네임 중복 -> 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(user)
        .expect(201);

      // 다른 이메일, 같은 닉네임
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: 'other@test.com' })
        .expect(409);

      expect(res.body.message).toEqual('이미 사용중인 값입니다.');
    });

    it('POST /auth/sign-up 잘못된 이메일 -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: 'not-an-email' })
        .expect(400);

      expect(res.body.message).toContain('email must be an email');
    });

    it('POST /auth/sign-up 비밀번호 8자 미만 -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, password: 'short1' })
        .expect(400);

      expect(res.body.message).toContain(
        'password must be longer than or equal to 8 characters',
      );
    });

    it('POST /auth/sign-up 모르는 필드 입력 -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, role: 'admin' })
        .expect(400);

      expect(res.body.message).toContain('property role should not exist');
    });
  });

  describe('POST /auth/sign-in', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(user)
        .expect(201);
    });

    it('POST /auth/sign-in 정상 -> 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('POST /auth/sign-in 이메일 대소문자 혼용 -> 로그인 성공 200', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: 'case@test.com', nickname: 'caseUser' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: 'cAsE@tEsT.cOm', password: user.password })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it('POST /auth/sign-in 이메일 앞뒤 공백 -> 로그인 성공 200', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...user, email: '  padded@test.com  ', nickname: 'paddedUser' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: '  padded@test.com  ', password: user.password })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it('POST /auth/sign-in 대소문자만 다른 이메일과 틀린 비밀번호 -> 일반 로그인 실패와 같은 401', async () => {
      const noUser = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: 'nobody@test.com', password: user.password })
        .expect(401);

      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: 'AUTH@test.com', password: 'wrong-password' })
        .expect(401);

      expect(noUser.body.message).toEqual(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
      expect(wrongPassword.body).toEqual(noUser.body);
    });

    it('POST /auth/sign-in 없는 이메일 / 틀린 비밀번호 -> 401, 같은 메시지', async () => {
      // 없는 이메일
      const noUser = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: 'nobody@test.com', password: user.password })
        .expect(401);

      // 틀린 비밀번호
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);

      // 어느 쪽이 틀렸는지 알려주지 않아야 함 (L1)
      expect(noUser.body.message).toEqual(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
      expect(wrongPassword.body).toEqual(noUser.body);
    });

    it('POST /auth/sign-in 빈 비밀번호 -> 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: user.email, password: '' })
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('POST /auth/refresh refreshToken -> 200, 새 accessToken 사용 가능', async () => {
      const { refreshToken } = await signUpAndSignIn();

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      // 새로 받은 accessToken으로 보호된 API 호출
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('POST /auth/refresh accessToken을 넣으면 -> 401 (서로 다른 secret)', async () => {
      const { accessToken } = await signUpAndSignIn();

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);

      expect(res.body.message).toEqual('유효하지 않은 토큰입니다.');
    });

    it('POST /auth/refresh JWT 형식이 아닌 값 -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'not-a-jwt' })
        .expect(400);

      expect(res.body.message).toContain('refreshToken must be a jwt string');
    });

    it('POST /auth/refresh 탈퇴(삭제)한 사용자 -> 401', async () => {
      const { id, refreshToken } = await signUpAndSignIn();

      // 토큰은 유효하지만 사용자가 사라진 상황
      await prisma.user.delete({ where: { id } });

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(res.body.message).toEqual('유효하지 않은 토큰입니다.');
    });
  });

  describe('GET /users/me', () => {
    it('GET /users/me 토큰 없음 -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .expect(401);

      expect(res.body.message).toEqual('로그인이 필요합니다.');
    });

    it('GET /users/me Bearer가 아닌 형식 -> 401', async () => {
      const { accessToken } = await signUpAndSignIn();

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Basic ${accessToken}`)
        .expect(401);
    });

    it('GET /users/me accessToken -> 200, passwordHash 없음', async () => {
      const { id, accessToken } = await signUpAndSignIn();

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id,
        email: user.email,
        nickname: user.nickname,
      });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('GET /users/me refreshToken -> 401', async () => {
      const { refreshToken } = await signUpAndSignIn();

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);

      expect(res.body.message).toEqual('유효하지 않은 토큰입니다.');
    });

    it('GET /users/me 변조된 토큰 -> 401', async () => {
      const { accessToken } = await signUpAndSignIn();

      // 서명(세 번째 부분)의 첫 글자를 바꿔서 변조
      // (마지막 글자는 base64 패딩 비트라 바꿔도 같은 값이 될 수 있음)
      const [header, payload, signature = ''] = accessToken.split('.');
      const first = signature[0] === 'A' ? 'B' : 'A';
      const tampered = `${header}.${payload}.${first}${signature.slice(1)}`;

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });
  });
});
