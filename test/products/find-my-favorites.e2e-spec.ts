import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { INT32_MAX } from '../../src/common/constants/limits.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

const BASE_TIME = Date.UTC(2026, 0, 1);
const MAX_CURSOR_TIME = 253_402_300_799_999;

// 구현의 인코더를 쓰지 않고 합의한 커서 형식을 직접 만든다
function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function at(seconds: number): Date {
  return new Date(BASE_TIME + seconds * 1000);
}

describe('Products find-my-favorites (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seller: { id: number; accessToken: string };
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  async function createProduct(name = '찜 목록 상품') {
    return prisma.product.create({
      data: {
        name,
        description: '찜 목록 테스트 설명',
        price: 1000,
        tags: ['기본'],
        sellerId: seller.id,
      },
    });
  }

  async function createProducts(count: number) {
    const products = [];
    for (let index = 1; index <= count; index += 1) {
      products.push(await createProduct(`찜 상품 ${index}`));
    }
    return products;
  }

  // createdAt을 명시해 시각 순서와 동률을 우연에 맡기지 않는다
  function favorite(userId: number, productId: number, createdAt: Date) {
    return prisma.productFavorite.create({
      data: { userId, productId, createdAt },
    });
  }

  function getFavorites(
    query?: Record<string, string | string[]>,
    token: string | null = userA.accessToken,
  ) {
    const req = request(app.getHttpServer()).get('/users/me/favorites');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return query ? req.query(query) : req;
  }

  function idsOf(body: { items: { id: number }[] }) {
    return body.items.map((item) => item.id);
  }

  function cursorOf(createdAt: Date, productId: number) {
    return encodePayload([createdAt.getTime(), productId]);
  }

  async function walk(limit: number) {
    const pages: { ids: number[]; nextCursor: string | null }[] = [];
    let cursor: string | undefined;

    for (let guard = 0; guard < 20; guard += 1) {
      const res = await getFavorites({
        limit: String(limit),
        ...(cursor ? { cursor } : {}),
      }).expect(200);
      pages.push({
        ids: idsOf(res.body),
        nextCursor: res.body.meta.nextCursor,
      });
      if (res.body.meta.nextCursor === null) return pages;
      cursor = res.body.meta.nextCursor;
    }
    throw new Error('페이지 순회가 끝나지 않았습니다.');
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    seller = await createTestUser(app, {
      email: 'my-favorites-seller@test.com',
      nickname: '목록판매자',
    });
    userA = await createTestUser(app, {
      email: 'my-favorites-a@test.com',
      nickname: '목록사용자A',
    });
    userB = await createTestUser(app, {
      email: 'my-favorites-b@test.com',
      nickname: '목록사용자B',
    });
  });

  beforeEach(async () => {
    await prisma.productFavorite.deleteMany();
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('인증', () => {
    it('GET /users/me/favorites 토큰 없음 -> 401', async () => {
      await getFavorites(undefined, null).expect(401);
    });

    it('GET /users/me/favorites 잘못된 토큰 -> 401', async () => {
      await getFavorites(undefined, 'invalid-token').expect(401);
    });
  });

  describe('응답 모양', () => {
    it('GET /users/me/favorites 정해진 키만 반환 -> 200', async () => {
      const product = await createProduct();
      await favorite(userA.id, product.id, at(1));

      const res = await getFavorites().expect(200);

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
        id: seller.id,
        nickname: '목록판매자',
      });
      expect(res.body.items[0]).not.toHaveProperty('description');
      expect(res.body.items[0]).not.toHaveProperty('updatedAt');
      expect(res.body.items[0]).not.toHaveProperty('sellerId');
      expect(res.body.meta.nextCursor).toBeNull();
    });

    it('GET /users/me/favorites 찜이 없으면 빈 목록과 null 커서 -> 200', async () => {
      await createProduct();

      const res = await getFavorites().expect(200);

      expect(res.body).toEqual({ items: [], meta: { nextCursor: null } });
    });
  });

  describe('내 찜만 조회', () => {
    it('GET /users/me/favorites 사용자 A와 B의 찜이 섞여 있어도 각자의 찜만 -> 200', async () => {
      const [p1, p2, p3, p4] = await createProducts(4);
      if (!p1 || !p2 || !p3 || !p4) throw new Error('상품 준비 실패');
      await favorite(userA.id, p1.id, at(1));
      await favorite(userB.id, p2.id, at(2));
      await favorite(userA.id, p3.id, at(3));
      await favorite(userB.id, p4.id, at(4));
      await favorite(userB.id, p1.id, at(5));

      const resA = await getFavorites().expect(200);
      const resB = await getFavorites(undefined, userB.accessToken).expect(200);

      expect(idsOf(resA.body)).toEqual([p3.id, p1.id]);
      expect(idsOf(resB.body)).toEqual([p1.id, p4.id, p2.id]);
    });
  });

  describe('정렬과 cursor 페이지네이션', () => {
    it('GET /users/me/favorites 상품 등록 순서와 달리 찜한 시각 내림차순 -> 200', async () => {
      const [p1, p2, p3] = await createProducts(3);
      if (!p1 || !p2 || !p3) throw new Error('상품 준비 실패');
      await favorite(userA.id, p2.id, at(1));
      await favorite(userA.id, p3.id, at(2));
      await favorite(userA.id, p1.id, at(3));

      const res = await getFavorites().expect(200);

      expect(idsOf(res.body)).toEqual([p1.id, p3.id, p2.id]);
    });

    it('GET /users/me/favorites 같은 시각이면 상품 id 내림차순, 같은 시각이 페이지 경계에 걸려도 중복·누락 없음 -> 200', async () => {
      const products = await createProducts(6);
      const [p1, p2, p3, p4, p5, p6] = products;
      if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) {
        throw new Error('상품 준비 실패');
      }
      const tied = at(20);
      await favorite(userA.id, p1.id, at(10));
      await favorite(userA.id, p3.id, tied);
      await favorite(userA.id, p2.id, tied);
      await favorite(userA.id, p5.id, tied);
      await favorite(userA.id, p4.id, tied);
      await favorite(userA.id, p6.id, at(30));
      const expected = [p6.id, p5.id, p4.id, p3.id, p2.id, p1.id];

      const unpaged = await getFavorites({ limit: '50' }).expect(200);
      expect(idsOf(unpaged.body)).toEqual(expected);

      // 한 페이지 크기 2: 첫 페이지 [p6, p5]의 다음이 같은 시각의 p4
      const pages = await walk(2);

      expect(pages.map((page) => page.ids)).toEqual([
        [p6.id, p5.id],
        [p4.id, p3.id],
        [p2.id, p1.id],
      ]);
      expect(pages.flatMap((page) => page.ids)).toEqual(expected);
      expect(pages[0]?.nextCursor).toBe(cursorOf(tied, p5.id));
      expect(pages[1]?.nextCursor).toBe(cursorOf(tied, p3.id));
      expect(pages[2]?.nextCursor).toBeNull();

      // 동률 안쪽(p4와 p3 사이)에서 끊어도 같은 결과
      const odd = await walk(3);
      expect(odd.flatMap((page) => page.ids)).toEqual(expected);
      expect(odd.at(-1)?.nextCursor).toBeNull();
    });

    it('GET /users/me/favorites?limit=2 5개를 2 → 2 → 1개로 순회하고 커서를 그대로 전달 -> 200', async () => {
      const products = await createProducts(5);
      const times = [3, 1, 5, 2, 4];
      const rows: { id: number; time: number }[] = [];
      for (const [index, product] of products.entries()) {
        const time = times[index] ?? 0;
        await favorite(userA.id, product.id, at(time));
        rows.push({ id: product.id, time });
      }
      const sorted = [...rows].sort((a, b) => b.time - a.time);
      const expected = sorted.map((row) => row.id);

      const pages = await walk(2);

      expect(pages.map((page) => page.ids.length)).toEqual([2, 2, 1]);
      expect(pages.flatMap((page) => page.ids)).toEqual(expected);
      expect(new Set(expected).size).toBe(5);
      const lastOf = (index: number) => {
        const row = sorted[index];
        if (!row) throw new Error(`정렬된 찜 ${index}번이 없습니다.`);
        return cursorOf(at(row.time), row.id);
      };
      expect(pages[0]?.nextCursor).toBe(lastOf(1));
      expect(pages[1]?.nextCursor).toBe(lastOf(3));
      expect(pages[2]?.nextCursor).toBeNull();
    });

    it('GET /users/me/favorites 남은 찜이 정확히 limit개이면 nextCursor는 null -> 200', async () => {
      const products = await createProducts(3);
      for (const [index, product] of products.entries()) {
        await favorite(userA.id, product.id, at(index + 1));
      }

      const res = await getFavorites({ limit: '3' }).expect(200);

      expect(res.body.items).toHaveLength(3);
      expect(res.body.meta.nextCursor).toBeNull();
    });

    it('GET /users/me/favorites 두 번째 페이지의 남은 찜이 정확히 limit개이면 null -> 200', async () => {
      const products = await createProducts(4);
      for (const [index, product] of products.entries()) {
        await favorite(userA.id, product.id, at(index + 1));
      }

      const first = await getFavorites({ limit: '2' }).expect(200);
      expect(first.body.meta.nextCursor).not.toBeNull();

      const second = await getFavorites({
        limit: '2',
        cursor: first.body.meta.nextCursor,
      }).expect(200);

      expect(second.body.items).toHaveLength(2);
      expect(second.body.meta.nextCursor).toBeNull();
    });

    it('GET /users/me/favorites 첫 페이지 마지막 찜을 취소해도 같은 커서로 다음 페이지 조회 -> 200', async () => {
      const products = await createProducts(5);
      for (const [index, product] of products.entries()) {
        await favorite(userA.id, product.id, at(index + 1));
      }
      const expected = products.map((product) => product.id).reverse();

      const first = await getFavorites({ limit: '2' }).expect(200);
      const cursor = first.body.meta.nextCursor;
      expect(idsOf(first.body)).toEqual(expected.slice(0, 2));

      await prisma.productFavorite.delete({
        where: {
          userId_productId: { userId: userA.id, productId: expected[1] ?? 0 },
        },
      });

      const second = await getFavorites({ limit: '2', cursor }).expect(200);

      expect(idsOf(second.body)).toEqual(expected.slice(2, 4));
      expect(second.body.meta.nextCursor).toBe(
        cursorOf(at(2), expected[3] ?? 0),
      );
    });

    it('GET /users/me/favorites 상품이 삭제돼 찜이 Cascade 삭제되면 목록에서 사라짐 -> 200', async () => {
      const [p1, p2, p3] = await createProducts(3);
      if (!p1 || !p2 || !p3) throw new Error('상품 준비 실패');
      await favorite(userA.id, p1.id, at(1));
      await favorite(userA.id, p2.id, at(2));
      await favorite(userA.id, p3.id, at(3));

      await prisma.product.delete({ where: { id: p2.id } });

      const res = await getFavorites().expect(200);

      expect(idsOf(res.body)).toEqual([p3.id, p1.id]);
    });

    it('GET /users/me/favorites 허용 범위 끝 시각의 커서 -> 200', async () => {
      const products = await createProducts(2);
      for (const [index, product] of products.entries()) {
        await favorite(userA.id, product.id, at(index + 1));
      }

      const latest = await getFavorites({
        cursor: encodePayload([MAX_CURSOR_TIME, 1]),
      }).expect(200);
      const earliest = await getFavorites({
        cursor: encodePayload([0, INT32_MAX]),
      }).expect(200);

      expect(latest.body.items).toHaveLength(2);
      expect(earliest.body).toEqual({ items: [], meta: { nextCursor: null } });
    });
  });

  describe('limit 검증', () => {
    it('GET /users/me/favorites 쿼리 없이 기본 limit 10 -> 200', async () => {
      const products = await createProducts(12);
      for (const [index, product] of products.entries()) {
        await favorite(userA.id, product.id, at(index + 1));
      }

      const res = await getFavorites().expect(200);

      expect(res.body.items).toHaveLength(10);
      expect(typeof res.body.meta.nextCursor).toBe('string');
    });

    it('GET /users/me/favorites?limit=100 상한 값 -> 200', async () => {
      await getFavorites({ limit: '100' }).expect(200);
    });

    it.each([
      ['limit=0', { limit: '0' }],
      ['limit=-1', { limit: '-1' }],
      ['limit=101', { limit: '101' }],
      ['limit=abc', { limit: 'abc' }],
      ['limit=1.5', { limit: '1.5' }],
      ['limit=빈 값', { limit: '' }],
      ['limit 배열', { limit: ['1', '2'] }],
    ])('GET /users/me/favorites?%s 잘못된 limit -> 400', async (_n, query) => {
      await getFavorites(query).expect(400);
    });

    it('GET /users/me/favorites?foo=1 허용하지 않은 쿼리 키 -> 400', async () => {
      await getFavorites({ foo: '1' }).expect(400);
    });
  });

  describe('cursor 검증', () => {
    it.each([
      ['허용되지 않은 문자', 'a!!b'],
      ['패딩이 포함된 Base64URL', 'WzAsMV0='],
      ['정규 형태가 아닌 Base64URL', 'WzAsMV1'],
      ['JSON이 아닌 내용', Buffer.from('invalid').toString('base64url')],
      ['빈 cursor', ''],
      ['객체', encodePayload({ timestamp: 0, productId: 1 })],
      ['null', encodePayload(null)],
      ['값이 하나인 배열', encodePayload([0])],
      ['값이 세 개인 배열', encodePayload([0, 1, 2])],
      ['문자열 시각', encodePayload(['0', 1])],
      ['소수 시각', encodePayload([1.5, 1])],
      ['음수 시각', encodePayload([-1, 1])],
      ['범위를 넘는 시각', encodePayload([MAX_CURSOR_TIME + 1, 1])],
      ['문자열 상품 ID', encodePayload([0, '1'])],
      ['0인 상품 ID', encodePayload([0, 0])],
      ['음수 상품 ID', encodePayload([0, -1])],
      ['소수 상품 ID', encodePayload([0, 1.5])],
      ['INT32_MAX 초과 상품 ID', encodePayload([0, INT32_MAX + 1])],
    ])('GET /users/me/favorites?cursor=%s -> 400', async (_name, cursor) => {
      const product = await createProduct();
      await favorite(userA.id, product.id, at(1));

      await getFavorites({ cursor }).expect(400);
    });

    it('GET /users/me/favorites?cursor=a&cursor=b 중복 cursor 쿼리 -> 400', async () => {
      const valid = encodePayload([MAX_CURSOR_TIME, 1]);

      await getFavorites({ cursor: [valid, valid] }).expect(400);
    });
  });
});
