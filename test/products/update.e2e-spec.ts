import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products update (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      name: '수정 전 상품',
      description: '수정 전 설명',
      price: 1200,
      tags: ['before'],
      ...overrides,
    };
  }

  async function createProduct(
    data: {
      name?: string;
      description?: string;
      price?: number;
      tags?: string[];
      sellerId?: number;
    } = {},
  ) {
    return prisma.product.create({
      data: {
        name: data.name ?? '기존 상품',
        description: data.description ?? '기존 상품 설명',
        price: data.price ?? 1500,
        tags: data.tags ?? ['original'],
        sellerId: data.sellerId ?? userA.id,
      },
    });
  }

  function patchProduct(
    id: string | number,
    token: string | undefined,
    body?: Record<string, unknown>,
  ) {
    const req = request(app.getHttpServer()).patch(
      `/products/${encodeURIComponent(String(id))}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  }

  async function expectUnchanged(
    id: number,
    original: Awaited<ReturnType<typeof createProduct>>,
  ) {
    const after = await prisma.product.findUnique({ where: { id } });
    expect(after).toEqual(original);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    userA = await createTestUser(app, {
      email: 'products-update-a@test.com',
      nickname: 'updA',
    });
    userB = await createTestUser(app, {
      email: 'products-update-b@test.com',
      nickname: 'updB',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('성공', () => {
    it('PATCH /products/:id 응답 키가 상세와 같고 sellerId 없음 -> 200', async () => {
      const product = await createProduct();

      const res = await patchProduct(product.id, userA.accessToken, {
        name: '수정된 상품',
      }).expect(200);

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
          'favoriteCount',
          'seller',
        ].sort(),
      );
      expect(res.body).not.toHaveProperty('sellerId');
      expect(Object.keys(res.body.seller).sort()).toEqual(
        ['id', 'nickname'].sort(),
      );
    });

    it('PATCH /products/:id price만 보내면 다른 필드는 유지 -> 200', async () => {
      const product = await createProduct();

      const res = await patchProduct(product.id, userA.accessToken, {
        price: 2500,
      }).expect(200);
      const saved = await prisma.product.findUnique({
        where: { id: product.id },
      });

      expect(res.body.price).toBe(2500);
      expect(res.body.name).toBe(product.name);
      expect(res.body.description).toBe(product.description);
      expect(res.body.tags).toEqual(product.tags);
      expect(saved).toMatchObject({
        price: 2500,
        name: product.name,
        description: product.description,
        tags: product.tags,
      });
    });

    it('PATCH /products/:id 네 필드를 모두 수정 -> 200', async () => {
      const product = await createProduct();

      const res = await patchProduct(
        product.id,
        userA.accessToken,
        validBody({
          name: '새 상품',
          description: '새 설명',
          price: 3000,
          tags: ['new', 'sale'],
        }),
      ).expect(200);

      expect(res.body).toMatchObject({
        name: '새 상품',
        description: '새 설명',
        price: 3000,
        tags: ['new', 'sale'],
      });
    });

    it('PATCH /products/:id 태그 정규화 후 응답과 DB에 저장 -> 200', async () => {
      const product = await createProduct();

      const res = await patchProduct(product.id, userA.accessToken, {
        tags: [' React ', 'react', 'Vue'],
      }).expect(200);
      const saved = await prisma.product.findUnique({
        where: { id: product.id },
      });

      expect(res.body.tags).toEqual(['react', 'vue']);
      expect(saved?.tags).toEqual(['react', 'vue']);
    });

    it('PATCH /products/:id updatedAt 갱신 및 createdAt 유지 -> 200', async () => {
      const product = await createProduct();
      const oldUpdatedAt = new Date('2000-01-01T00:00:00.000Z');
      await prisma.product.update({
        where: { id: product.id },
        data: { updatedAt: oldUpdatedAt },
      });
      const before = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });

      const res = await patchProduct(product.id, userA.accessToken, {
        price: 2400,
      }).expect(200);

      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(new Date(res.body.createdAt).getTime()).toBe(
        before.createdAt.getTime(),
      );
    });

    it('PATCH /products/:id 수정 후 판매자는 그대로 유지 -> 200', async () => {
      const product = await createProduct();

      const res = await patchProduct(product.id, userA.accessToken, {
        name: '수정 후 상품',
      }).expect(200);

      expect(res.body.seller).toEqual({ id: userA.id, nickname: 'updA' });
    });

    it('PATCH /products/:id B가 B의 상품을 수정 -> 200', async () => {
      const product = await createProduct({ sellerId: userB.id });

      const res = await patchProduct(product.id, userB.accessToken, {
        name: 'B의 수정 상품',
      }).expect(200);

      expect(res.body.name).toBe('B의 수정 상품');
      expect(res.body.seller).toEqual({ id: userB.id, nickname: 'updB' });
    });
  });

  describe('인증과 권한', () => {
    it.each([
      ['토큰 없음', undefined],
      ['잘못된 토큰', 'invalid-token'],
    ])('PATCH /products/:id %s -> 401', async (_label, token) => {
      const product = await createProduct();

      await patchProduct(product.id, token, { price: 9999 }).expect(401);
      await expectUnchanged(product.id, product);
    });

    it('PATCH /products/:id B가 A의 상품 수정 시도 -> 403', async () => {
      const product = await createProduct();

      const res = await patchProduct(product.id, userB.accessToken, {
        name: '위조 수정',
      }).expect(403);

      expect(res.body.message).toBe('판매자만 수정할 수 있습니다.');
      await expectUnchanged(product.id, product);
    });

    it('PATCH /products/:id 없는 상품 -> 404', async () => {
      const control = await createProduct({ name: '유지할 상품' });

      const res = await patchProduct(control.id + 1000, userA.accessToken, {
        price: 9999,
      }).expect(404);

      expect(res.body.message).toBe('상품을 찾을 수 없습니다.');
      await expectUnchanged(control.id, control);
    });
  });

  describe('입력 검증', () => {
    it('PATCH /products/:id 빈 본문 -> 400', async () => {
      const product = await createProduct();

      const res = await patchProduct(product.id, userA.accessToken, {}).expect(
        400,
      );

      expect(res.body.message).toBe('수정할 내용이 없습니다.');
      await expectUnchanged(product.id, product);
    });

    it.each([
      ['name 빈 문자열', { name: '' }],
      ['name 공백만', { name: '   ' }],
      ['name 31자', { name: '가'.repeat(31) }],
      ['name null', { name: null }],
      ['description 빈 문자열', { description: '' }],
      ['description null', { description: null }],
      ['price 음수', { price: -1 }],
      ['price 최댓값 초과', { price: 10_000_001 }],
      ['price 소수', { price: 1.5 }],
      ['price 문자열', { price: '100' }],
      ['price null', { price: null }],
      ['tags 빈 배열', { tags: [] }],
      ['tags 6개', { tags: ['one', 'two', 'three', 'four', 'five', 'six'] }],
      ['tags 배열 아님', { tags: 'react' }],
      ['tags 빈 문자열 원소', { tags: [''] }],
      ['tags 21자 원소', { tags: ['a'.repeat(21)] }],
      ['tags null', { tags: null }],
    ])('PATCH /products/:id 잘못된 입력(%s) -> 400', async (_name, body) => {
      const product = await createProduct();

      await patchProduct(product.id, userA.accessToken, body).expect(400);
      await expectUnchanged(product.id, product);
    });

    it.each([
      ['sellerId', { sellerId: 999999 }],
      ['images', { images: [] }],
      ['id', { id: 999 }],
    ])(
      'PATCH /products/:id 허용하지 않는 필드 %s -> 400',
      async (_name, body) => {
        const product = await createProduct();

        await patchProduct(product.id, userA.accessToken, body).expect(400);
        await expectUnchanged(product.id, product);
      },
    );

    it.each(['0', 'abc'])('PATCH /products/%s 잘못된 id -> 400', async (id) => {
      const product = await createProduct();

      await patchProduct(id, userA.accessToken, { price: 9999 }).expect(400);
      await expectUnchanged(product.id, product);
    });

    it('PATCH /products/abc 토큰 없이 id 검증보다 먼저 인증 -> 401', async () => {
      const product = await createProduct();

      await patchProduct('abc', undefined, { price: 9999 }).expect(401);
      await expectUnchanged(product.id, product);
    });
  });
});
