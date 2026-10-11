import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // 상품 판매자 A와 B
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      name: '테스트 상품',
      description: '상품 설명',
      price: 1000,
      tags: ['react'],
      ...overrides,
    };
  }

  function postProduct(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function expectInvalidProduct(body: Record<string, unknown>) {
    await postProduct(userA.accessToken, body).expect(400);
    expect(await prisma.product.count()).toBe(0);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 상품 입력 검증 테스트가 사용자당 요청 제한을 소비하지 않도록 비활성화
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    userA = await createTestUser(app, {
      email: 'products-a@test.com',
      nickname: 'prodA',
    });
    userB = await createTestUser(app, {
      email: 'products-b@test.com',
      nickname: 'prodB',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('성공', () => {
    it('POST /products 정상 등록 -> 201', async () => {
      const body = validBody();
      const res = await postProduct(userA.accessToken, body).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(
        [
          'id',
          'name',
          'description',
          'price',
          'tags',
          'images',
          'createdAt',
          'updatedAt',
          'seller',
        ].sort(),
      );
      expect(res.body).toMatchObject({
        name: body.name,
        description: body.description,
        price: body.price,
        tags: body.tags,
        images: [],
        seller: { id: userA.id, nickname: 'prodA' },
      });
      expect(res.body.id).toEqual(expect.any(Number));
      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(res.body.updatedAt).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('sellerId');

      const saved = await prisma.product.findUnique({
        where: { id: res.body.id as number },
      });
      expect(saved?.sellerId).toBe(userA.id);
    });

    it('POST /products B가 등록 -> seller는 B 201', async () => {
      const res = await postProduct(userB.accessToken, validBody()).expect(201);

      expect(res.body.seller).toEqual({ id: userB.id, nickname: 'prodB' });
    });

    it('POST /products price 0 -> 201', async () => {
      const res = await postProduct(
        userA.accessToken,
        validBody({ price: 0 }),
      ).expect(201);

      expect(res.body.price).toBe(0);
    });

    it('POST /products price 10000000 -> 201', async () => {
      const res = await postProduct(
        userA.accessToken,
        validBody({ price: 10_000_000 }),
      ).expect(201);

      expect(res.body.price).toBe(10_000_000);
    });

    it('POST /products name 정확히 30자 -> 201', async () => {
      const name = '가'.repeat(30);
      const res = await postProduct(
        userA.accessToken,
        validBody({ name }),
      ).expect(201);

      expect(res.body.name).toBe(name);
    });

    it('POST /products description 5000자 최대 제한 없음 -> 201', async () => {
      const description = '설'.repeat(5000);
      const res = await postProduct(
        userA.accessToken,
        validBody({ description }),
      ).expect(201);

      expect(res.body.description).toBe(description);
    });
  });

  describe('정규화', () => {
    it('POST /products name과 description 앞뒤 공백 -> trim 후 저장 201', async () => {
      const res = await postProduct(
        userA.accessToken,
        validBody({ name: '  상품 이름  ', description: '  상세 설명  ' }),
      ).expect(201);

      expect(res.body.name).toBe('상품 이름');
      expect(res.body.description).toBe('상세 설명');
      const saved = await prisma.product.findUnique({
        where: { id: res.body.id as number },
      });
      expect(saved?.name).toBe('상품 이름');
      expect(saved?.description).toBe('상세 설명');
    });

    it('POST /products 태그 trim, 소문자 변환, 중복 제거 -> 첫 순서 유지 201', async () => {
      const res = await postProduct(
        userA.accessToken,
        validBody({ tags: [' React ', 'react', 'Vue'] }),
      ).expect(201);

      expect(res.body.tags).toEqual(['react', 'vue']);
    });

    it('POST /products 한글·영문 태그 정규화 -> 201', async () => {
      const res = await postProduct(
        userA.accessToken,
        validBody({ tags: ['판다', 'NestJS'] }),
      ).expect(201);

      expect(res.body.tags).toEqual(['판다', 'nestjs']);
    });

    it('POST /products 중복 제거 후 태그 5개 -> 201', async () => {
      const res = await postProduct(
        userA.accessToken,
        validBody({ tags: ['one', 'two', 'three', 'four', 'five', 'ONE'] }),
      ).expect(201);

      expect(res.body.tags).toEqual(['one', 'two', 'three', 'four', 'five']);
    });

    it('POST /products 태그 정확히 20자 -> 201', async () => {
      const tag = 'a'.repeat(20);
      const res = await postProduct(
        userA.accessToken,
        validBody({ tags: [tag] }),
      ).expect(201);

      expect(res.body.tags).toEqual([tag]);
    });
  });

  describe('검증 실패', () => {
    it.each([
      ['price 누락', { price: undefined }],
      ['price 음수', { price: -1 }],
      ['price 최댓값 초과', { price: 10_000_001 }],
      ['price 소수', { price: 1.5 }],
      ['price 문자열', { price: '1000' }],
      ['price null', { price: null }],
      ['name 누락', { name: undefined }],
      ['name 빈 문자열', { name: '' }],
      ['name 공백만', { name: '   ' }],
      ['name 31자', { name: '가'.repeat(31) }],
      ['description 누락', { description: undefined }],
      ['description 공백만', { description: '   ' }],
      ['tags 누락', { tags: undefined }],
      ['tags 빈 배열', { tags: [] }],
      ['tags 배열 아님', { tags: 'react' }],
      ['tags 숫자 원소', { tags: [1] }],
      ['tags 공백 원소', { tags: ['   '] }],
      [
        'tags 정규화 후 6개',
        { tags: ['one', 'two', 'three', 'four', 'five', 'six'] },
      ],
      ['tags 21자 원소', { tags: ['a'.repeat(21)] }],
      ['tags null', { tags: null }],
    ])('POST /products 잘못된 입력(%s) -> 400', async (_name, override) => {
      await expectInvalidProduct(validBody(override));
    });

    it.each([
      ['images', { images: [] }],
      ['foo', { foo: 'bar' }],
    ])('POST /products 정의되지 않은 필드 %s -> 400', async (_name, extra) => {
      await expectInvalidProduct({ ...validBody(), ...extra });
    });

    it('POST /products sellerId 위조 필드 -> 400', async () => {
      await expectInvalidProduct(validBody({ sellerId: userB.id }));
    });
  });

  describe('인증', () => {
    it('POST /products 토큰 없음 -> 401', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .send(validBody())
        .expect(401);

      expect(await prisma.product.count()).toBe(0);
    });

    it('POST /products 잘못된 토큰 -> 401', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', 'Bearer invalid-token')
        .send(validBody())
        .expect(401);

      expect(await prisma.product.count()).toBe(0);
    });
  });
});
