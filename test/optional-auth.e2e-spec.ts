import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { OptionalAuth } from '../src/auth/decorators/optional-auth.decorator.js';
import { Public } from '../src/auth/decorators/public.decorator.js';

@Controller('optional-auth-test/handler')
class ConflictingHandlerController {
  @Get()
  @Public()
  @OptionalAuth()
  findOne() {
    return { message: '핸들러가 실행되면 안 됩니다.' };
  }
}

@Public()
@Controller('optional-auth-test/class')
class ConflictingClassController {
  @Get()
  @OptionalAuth()
  findOne() {
    return { message: '핸들러가 실행되면 안 됩니다.' };
  }
}

describe('Optional auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ConflictingHandlerController, ConflictingClassController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['핸들러에 두 데코레이터 지정', '/optional-auth-test/handler'],
    ['클래스 Public과 핸들러 OptionalAuth 지정', '/optional-auth-test/class'],
  ])(
    'GET %s 시 전역 Guard가 내부 메시지를 숨김 -> 500',
    async (_name, path) => {
      const res = await request(app.getHttpServer()).get(path).expect(500);

      expect(res.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(res.text).not.toContain(
        '@Public()과 @OptionalAuth()는 동시에 사용할 수 없습니다.',
      );
    },
  );
});
