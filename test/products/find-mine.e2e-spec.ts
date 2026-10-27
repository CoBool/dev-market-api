import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products find-mine (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  async function createProduct(sellerId: number, name = '내 상품') {
    return prisma.product.create({
      data: {
        name,
        description: '일반 상품 설명',
        price: 1000,
        tags: ['기본'],
        sellerId,
      },
    });
  }

  async function createProducts(sellerId: number, count: number) {
    const products = [];
    for (let index = 1; index <= count; index += 1) {
      products.push(await createProduct(sellerId, `상품 ${index}`));
    }
    return products;
  }

  function getMine(
    query?: Record<string, string | string[]>,
    token: string | null = userA.accessToken,
  ) {
    const req = request(app.getHttpServer()).get('/users/me/products');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return query ? req.query(query) : req;
  }

  function idsOf(body: { items: { id: number }[] }) {
    return body.items.map((item) => item.id);
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
      email: 'products-mine-a@test.com',
      nickname: 'mineA',
    });
    userB = await createTestUser(app, {
      email: 'products-mine-b@test.com',
      nickname: 'mineB',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('인증', () => {
    it('GET /users/me/products 토큰 없음 -> 401', async () => {
      await createProduct(userA.id);

      await getMine(undefined, null).expect(401);
    });

    it('GET /users/me/products 잘못된 토큰 -> 401', async () => {
      await createProduct(userA.id);

      await getMine(undefined, 'invalid-token').expect(401);
    });
  });

  describe('응답 모양', () => {
    it('GET /users/me/products 정해진 키만 반환 -> 200', async () => {
      const product = await createProduct(userA.id);

      const res = await getMine().expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['items', 'meta']);
      expect(Object.keys(res.body.meta)).toEqual(['nextCursor']);
      expect(res.body.items).toHaveLength(1);
      expect(Object.keys(res.body.items[0]).sort()).toEqual(
        [
          'id',
          'name',
          'price',
          'tags',
          'images',
          'createdAt',
          'favoriteCount',
          'seller',
        ].sort(),
      );
      expect(Object.keys(res.body.items[0].seller).sort()).toEqual([
        'id',
        'nickname',
      ]);
      expect(res.body.items[0].id).toBe(product.id);
      expect(res.body.items[0].seller).toEqual({
        id: userA.id,
        nickname: 'mineA',
      });
      expect(res.body.items[0]).not.toHaveProperty('description');
      expect(res.body.items[0]).not.toHaveProperty('updatedAt');
      expect(res.body.items[0]).not.toHaveProperty('sellerId');
    });

    it('GET /users/me/products 상품이 없으면 빈 목록과 null 커서 -> 200', async () => {
      const res = await getMine().expect(200);

      expect(res.body).toEqual({ items: [], meta: { nextCursor: null } });
    });
  });

  describe('내 상품만 조회', () => {
    it('GET /users/me/products 사용자 A와 B의 상품이 섞여 있어도 각자의 상품만 -> 200', async () => {
      const a1 = await createProduct(userA.id, 'A 상품 1');
      await createProduct(userB.id, 'B 상품 1');
      const a2 = await createProduct(userA.id, 'A 상품 2');
      const b2 = await createProduct(userB.id, 'B 상품 2');

      const resA = await getMine().expect(200);
      const resB = await getMine(undefined, userB.accessToken).expect(200);

      expect(idsOf(resA.body)).toEqual([a2.id, a1.id]);
      expect(
        resA.body.items.every(
          (item: { seller: { id: number } }) => item.seller.id === userA.id,
        ),
      ).toBe(true);
      expect(idsOf(resB.body)).toContain(b2.id);
      expect(resB.body.items).toHaveLength(2);
      expect(
        resB.body.items.every(
          (item: { seller: { id: number } }) => item.seller.id === userB.id,
        ),
      ).toBe(true);
    });

    it('GET /users/me/products 내 상품이 없고 다른 사용자 상품만 있으면 빈 목록 -> 200', async () => {
      await createProduct(userB.id);

      const res = await getMine().expect(200);

      expect(res.body).toEqual({ items: [], meta: { nextCursor: null } });
    });
  });

  describe('정렬과 cursor 페이지네이션', () => {
    it('GET /users/me/products 쿼리 없이 id 내림차순, 기본 limit 10 -> 200', async () => {
      const products = await createProducts(userA.id, 12);
      const expected = products.map((product) => product.id).reverse();

      const res = await getMine().expect(200);

      expect(idsOf(res.body)).toEqual(expected.slice(0, 10));
      expect(res.body.meta.nextCursor).toBe(expected[9]);
    });

    it('GET /users/me/products?limit=100 상한 값 -> 200', async () => {
      await createProduct(userA.id);

      await getMine({ limit: '100' }).expect(200);
    });

    it('GET /users/me/products?limit=2 5개를 2 → 2 → 1개로 순회, 중복과 누락 없음 -> 200', async () => {
      // 다른 사용자 상품을 사이사이에 섞어 id가 연속되지 않게 한다
      const mine = [];
      for (let index = 1; index <= 5; index += 1) {
        mine.push(await createProduct(userA.id, `내 상품 ${index}`));
        await createProduct(userB.id, `남의 상품 ${index}`);
      }
      const expected = mine.map((product) => product.id).reverse();

      const first = await getMine({ limit: '2' }).expect(200);
      expect(idsOf(first.body)).toEqual(expected.slice(0, 2));
      expect(first.body.meta.nextCursor).toBe(first.body.items.at(-1).id);

      const second = await getMine({
        limit: '2',
        cursor: String(first.body.meta.nextCursor),
      }).expect(200);
      expect(idsOf(second.body)).toEqual(expected.slice(2, 4));
      expect(second.body.meta.nextCursor).toBe(second.body.items.at(-1).id);

      const third = await getMine({
        limit: '2',
        cursor: String(second.body.meta.nextCursor),
      }).expect(200);
      expect(idsOf(third.body)).toEqual(expected.slice(4));
      expect(third.body.items).toHaveLength(1);
      expect(third.body.meta.nextCursor).toBeNull();

      const received = [
        ...idsOf(first.body),
        ...idsOf(second.body),
        ...idsOf(third.body),
      ];
      expect(new Set(received).size).toBe(5);
      expect(received).toEqual(expected);
    });

    it('GET /users/me/products 상품 수가 정확히 limit개이면 nextCursor는 null -> 200', async () => {
      await createProducts(userA.id, 3);

      const res = await getMine({ limit: '3' }).expect(200);

      expect(res.body.items).toHaveLength(3);
      expect(res.body.meta.nextCursor).toBeNull();
    });

    it('GET /users/me/products?limit=2 limit보다 1개 많으면 nextCursor는 마지막 id, 다음 페이지는 1개 -> 200', async () => {
      const products = await createProducts(userA.id, 3);
      const expected = products.map((product) => product.id).reverse();

      const first = await getMine({ limit: '2' }).expect(200);
      expect(idsOf(first.body)).toEqual(expected.slice(0, 2));
      expect(first.body.meta.nextCursor).toBe(expected[1]);

      const second = await getMine({
        limit: '2',
        cursor: String(expected[1]),
      }).expect(200);
      expect(idsOf(second.body)).toEqual([expected[2]]);
      expect(second.body.meta.nextCursor).toBeNull();
    });

    it('GET /users/me/products?cursor 해당 id는 포함하지 않는 경계 -> 200', async () => {
      const products = await createProducts(userA.id, 3);
      const [oldest, middle, newest] = products;

      const res = await getMine({ cursor: String(newest?.id) }).expect(200);

      expect(idsOf(res.body)).toEqual([middle?.id, oldest?.id]);
    });

    it('GET /users/me/products?cursor 다른 사용자 상품 id도 단순한 경계로만 사용 -> 200', async () => {
      const a1 = await createProduct(userA.id, 'A 상품 1');
      const b1 = await createProduct(userB.id, 'B 상품 1');
      const a2 = await createProduct(userA.id, 'A 상품 2');
      const b2 = await createProduct(userB.id, 'B 상품 2');
      const a3 = await createProduct(userA.id, 'A 상품 3');

      // id 순서: a1 < b1 < a2 < b2 < a3. b2보다 작은 내 상품만
      const res = await getMine({ cursor: String(b2.id) }).expect(200);
      expect(idsOf(res.body)).toEqual([a2.id, a1.id]);
      expect(res.body.meta.nextCursor).toBeNull();

      // b1보다 작은 내 상품만
      const res2 = await getMine({ cursor: String(b1.id) }).expect(200);
      expect(idsOf(res2.body)).toEqual([a1.id]);
      expect(
        res2.body.items.map((item: { id: number }) => item.id),
      ).not.toContain(a3.id);
    });

    it('GET /users/me/products?cursor 존재하지 않는 큰 id도 경계로 동작 -> 200', async () => {
      const products = await createProducts(userA.id, 2);

      const res = await getMine({ cursor: '2147483647' }).expect(200);

      expect(idsOf(res.body)).toEqual(
        products.map((product) => product.id).reverse(),
      );
    });

    it('GET /users/me/products 첫 페이지 마지막 상품이 삭제돼도 그 cursor로 다음 페이지 조회 -> 200', async () => {
      const products = await createProducts(userA.id, 5);
      const expected = products.map((product) => product.id).reverse();

      const first = await getMine({ limit: '2' }).expect(200);
      const cursor = first.body.meta.nextCursor;
      expect(cursor).toBe(expected[1]);

      await prisma.product.delete({ where: { id: cursor } });

      const second = await getMine({
        limit: '2',
        cursor: String(cursor),
      }).expect(200);

      expect(idsOf(second.body)).toEqual(expected.slice(2, 4));
      expect(second.body.meta.nextCursor).toBe(expected[3]);
    });
  });

  describe('쿼리 검증', () => {
    it.each([
      ['cursor=0', { cursor: '0' }],
      ['cursor=-1', { cursor: '-1' }],
      ['cursor=abc', { cursor: 'abc' }],
      ['cursor=1.5', { cursor: '1.5' }],
      ['cursor=빈 값', { cursor: '' }],
      ['cursor=INT32_MAX 초과', { cursor: '2147483648' }],
      ['cursor 배열', { cursor: ['1', '2'] }],
      ['limit=0', { limit: '0' }],
      ['limit=-1', { limit: '-1' }],
      ['limit=101', { limit: '101' }],
      ['limit=abc', { limit: 'abc' }],
      ['limit=1.5', { limit: '1.5' }],
      ['limit=빈 값', { limit: '' }],
      ['limit 배열', { limit: ['1', '2'] }],
    ])('GET /users/me/products?%s 잘못된 쿼리 -> 400', async (_name, query) => {
      await createProduct(userA.id);

      await getMine(query).expect(400);
    });

    it('GET /users/me/products?foo=1 허용하지 않은 쿼리 키 -> 400', async () => {
      await getMine({ foo: '1' }).expect(400);
    });
  });
});
