import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products favorite (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seller: { id: number; accessToken: string };
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };
  let userC: { id: number; accessToken: string };

  async function createProduct(sellerId = seller.id) {
    return prisma.product.create({
      data: {
        name: '찜 테스트 상품',
        description: '찜 API 테스트 설명',
        price: 1500,
        tags: ['favorite'],
        sellerId,
      },
    });
  }

  function favoriteRequest(
    method: 'get' | 'put' | 'delete',
    id: string | number,
    token?: string,
  ) {
    const req = request(app.getHttpServer())[method](
      `/products/${encodeURIComponent(String(id))}/favorite`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  }

  const getFavorite = (id: string | number, token?: string) =>
    favoriteRequest('get', id, token);
  const putFavorite = (id: string | number, token?: string) =>
    favoriteRequest('put', id, token);
  const deleteFavorite = (id: string | number, token?: string) =>
    favoriteRequest('delete', id, token);

  function expectStatus(res: { body: Record<string, unknown> }) {
    expect(Object.keys(res.body).sort()).toEqual(
      ['productId', 'isFavorite', 'favoriteCount'].sort(),
    );
  }

  async function favoriteRows(productId: number) {
    return prisma.productFavorite.count({ where: { productId } });
  }

  async function expectCount(productId: number, count: number) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.favoriteCount).toBe(count);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    // 동시 요청 중 supertest가 서버를 직접 열고 닫아 연결이 끊기지 않도록 미리 연다
    await app.listen(0);
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    seller = await createTestUser(app, {
      email: 'favorite-seller@test.com',
      nickname: '찜판매자',
    });
    userA = await createTestUser(app, {
      email: 'favorite-user-a@test.com',
      nickname: '찜사용자A',
    });
    userB = await createTestUser(app, {
      email: 'favorite-user-b@test.com',
      nickname: '찜사용자B',
    });
    userC = await createTestUser(app, {
      email: 'favorite-user-c@test.com',
      nickname: '찜사용자C',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('인증과 검증', () => {
    it.each(['GET', 'PUT', 'DELETE'] as const)(
      '%s /products/:id/favorite 토큰 없음 -> 401',
      async (method) => {
        const product = await createProduct();
        const req = favoriteRequest(
          method.toLowerCase() as 'get' | 'put' | 'delete',
          product.id,
        );
        await req.expect(401);
        expect(await favoriteRows(product.id)).toBe(0);
        await expectCount(product.id, 0);
      },
    );

    it.each(['GET', 'PUT', 'DELETE'] as const)(
      '%s /products/:id/favorite 없는 상품 -> 404',
      async (method) => {
        const product = await createProduct();
        const missingId = product.id + 1000;
        const req = favoriteRequest(
          method.toLowerCase() as 'get' | 'put' | 'delete',
          missingId,
          userA.accessToken,
        );
        const res = await req.expect(404);
        expect(res.body.message).toBe('상품을 찾을 수 없습니다.');
        expect(await favoriteRows(product.id)).toBe(0);
        await expectCount(product.id, 0);
      },
    );

    it.each(['GET', 'PUT', 'DELETE'] as const)(
      '%s /products/:id/favorite 잘못된 id -> 400',
      async (method) => {
        const product = await createProduct();
        for (const id of ['abc', '0', '-1']) {
          await favoriteRequest(
            method.toLowerCase() as 'get' | 'put' | 'delete',
            id,
            userA.accessToken,
          ).expect(400);
        }
        expect(await favoriteRows(product.id)).toBe(0);
        await expectCount(product.id, 0);
      },
    );
  });

  describe('GET /products/:id/favorite', () => {
    it('GET /products/:id/favorite 찜하지 않은 상품 -> false, 200', async () => {
      const product = await createProduct();
      const res = await getFavorite(product.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: false,
        favoriteCount: 0,
      });
    });

    it('GET /products/:id/favorite 내가 찜한 상품 -> true, 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const res = await getFavorite(product.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: true,
        favoriteCount: 1,
      });
    });

    it('GET /products/:id/favorite 다른 사용자만 찜한 상품 -> 내 찜 여부 false, 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userB.accessToken).expect(200);
      await putFavorite(product.id, userC.accessToken).expect(200);
      const res = await getFavorite(product.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: false,
        favoriteCount: 2,
      });
    });
  });

  describe('PUT /products/:id/favorite', () => {
    it('PUT /products/:id/favorite 처음 찜 -> true와 DB에 한 행, 200', async () => {
      const product = await createProduct();
      const res = await putFavorite(product.id, userA.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: true,
        favoriteCount: 1,
      });
      expect(await favoriteRows(product.id)).toBe(1);
      await expectCount(product.id, 1);
    });

    it('PUT /products/:id/favorite 같은 사용자가 두 번 찜 -> 카운트 유지, 200', async () => {
      const product = await createProduct();
      const first = await putFavorite(product.id, userA.accessToken).expect(
        200,
      );
      const second = await putFavorite(product.id, userA.accessToken).expect(
        200,
      );
      expectStatus(first);
      expectStatus(second);
      expect(first.body.favoriteCount).toBe(1);
      expect(second.body).toEqual({
        productId: product.id,
        isFavorite: true,
        favoriteCount: 1,
      });
      expect(await favoriteRows(product.id)).toBe(1);
      await expectCount(product.id, 1);
    });

    it('PUT /products/:id/favorite 자기 상품도 찜 가능 -> 200', async () => {
      const product = await createProduct(seller.id);
      const res = await putFavorite(product.id, seller.accessToken).expect(200);
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: true,
        favoriteCount: 1,
      });
      expect(await favoriteRows(product.id)).toBe(1);
    });

    it('PUT /products/:id/favorite 다른 사용자 두 명이 찜 -> favoriteCount 2, 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const res = await putFavorite(product.id, userB.accessToken).expect(200);
      expectStatus(res);
      expect(res.body.favoriteCount).toBe(2);
      expect(await favoriteRows(product.id)).toBe(2);
      await expectCount(product.id, 2);
    });
  });

  describe('DELETE /products/:id/favorite', () => {
    it('DELETE /products/:id/favorite 찜한 상품 취소 -> false와 카운트 0, 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const res = await deleteFavorite(product.id, userA.accessToken).expect(
        200,
      );
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: false,
        favoriteCount: 0,
      });
      expect(await favoriteRows(product.id)).toBe(0);
      await expectCount(product.id, 0);
    });

    it('DELETE /products/:id/favorite 찜하지 않은 상품 취소 -> 상태 유지, 200', async () => {
      const product = await createProduct();
      const res = await deleteFavorite(product.id, userA.accessToken).expect(
        200,
      );
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: false,
        favoriteCount: 0,
      });
      expect(await favoriteRows(product.id)).toBe(0);
      await expectCount(product.id, 0);
    });

    it('DELETE /products/:id/favorite 다른 사용자 세 명의 찜은 유지 -> 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      await putFavorite(product.id, userB.accessToken).expect(200);
      await putFavorite(product.id, userC.accessToken).expect(200);
      const res = await deleteFavorite(product.id, seller.accessToken).expect(
        200,
      );
      expectStatus(res);
      expect(res.body).toEqual({
        productId: product.id,
        isFavorite: false,
        favoriteCount: 3,
      });
      expect(await favoriteRows(product.id)).toBe(3);
      await expectCount(product.id, 3);
    });

    it('DELETE /products/:id/favorite 같은 사용자가 두 번 취소 -> 카운트 0 유지, 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const first = await deleteFavorite(product.id, userA.accessToken).expect(
        200,
      );
      const second = await deleteFavorite(product.id, userA.accessToken).expect(
        200,
      );
      expectStatus(first);
      expectStatus(second);
      expect(first.body.favoriteCount).toBe(0);
      expect(second.body).toEqual({
        productId: product.id,
        isFavorite: false,
        favoriteCount: 0,
      });
      expect(await favoriteRows(product.id)).toBe(0);
      await expectCount(product.id, 0);
    });
  });

  describe('updatedAt', () => {
    it('PUT /products/:id/favorite 찜 후 상품 updatedAt 유지 -> 200', async () => {
      const product = await createProduct();
      const before = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await putFavorite(product.id, userA.accessToken).expect(200);
      const detail = await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(detail.body.updatedAt).toBe(before.updatedAt.toISOString());
      expect(after.updatedAt.toISOString()).toBe(
        before.updatedAt.toISOString(),
      );
    });

    it('DELETE /products/:id/favorite 취소 후 상품 updatedAt 유지 -> 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const before = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await deleteFavorite(product.id, userA.accessToken).expect(200);
      const detail = await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(detail.body.updatedAt).toBe(before.updatedAt.toISOString());
      expect(after.updatedAt.toISOString()).toBe(
        before.updatedAt.toISOString(),
      );
    });

    it('PATCH /products/:id 찜 후 상품 수정 시 updatedAt 갱신 -> 200', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const before = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const res = await request(app.getHttpServer())
        .patch(`/products/${product.id}`)
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .send({ name: '찜 후 수정 상품' })
        .expect(200);
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(new Date(res.body.updatedAt).toISOString()).not.toBe(
        before.updatedAt.toISOString(),
      );
      expect(after.updatedAt.toISOString()).toBe(res.body.updatedAt);
    });
  });

  describe('동시 요청', () => {
    it('PUT /products/:id/favorite 서로 다른 사용자 열 명이 동시에 찜 5회 -> 매회 10개', async () => {
      for (let round = 1; round <= 5; round += 1) {
        const product = await createProduct();
        const users = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            createTestUser(app, {
              email: `favorite-concurrent-${round}-${index}@test.com`,
              nickname: `동시${round}${index}`,
            }),
          ),
        );
        const responses = await Promise.all(
          users.map((user) => putFavorite(product.id, user.accessToken)),
        );
        responses.forEach(expectStatus);
        expect(
          responses.map((res) => res.status),
          `회차 ${round}`,
        ).toEqual(Array(10).fill(200));
        expect(await favoriteRows(product.id), `회차 ${round} 찜 행 수`).toBe(
          10,
        );
        await expectCount(product.id, 10);
      }
    });

    it('PUT /products/:id/favorite 같은 사용자가 동시에 다섯 번 찜 -> 행 한 개', async () => {
      const product = await createProduct();
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          putFavorite(product.id, userA.accessToken),
        ),
      );
      responses.forEach(expectStatus);
      expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
      expect(await favoriteRows(product.id)).toBe(1);
      await expectCount(product.id, 1);
    });

    it('DELETE /products/:id/favorite 같은 사용자가 동시에 다섯 번 취소 -> 행 없음', async () => {
      const product = await createProduct();
      await putFavorite(product.id, userA.accessToken).expect(200);
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          deleteFavorite(product.id, userA.accessToken),
        ),
      );
      responses.forEach(expectStatus);
      expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
      expect(await favoriteRows(product.id)).toBe(0);
      await expectCount(product.id, 0);
    });
  });

  it('DELETE /products/:id 찜이 있는 상품을 판매자가 삭제 -> 204, 찜 행 Cascade 삭제', async () => {
    const product = await createProduct();
    await putFavorite(product.id, userA.accessToken).expect(200);
    await putFavorite(product.id, userB.accessToken).expect(200);

    const res = await request(app.getHttpServer())
      .delete(`/products/${product.id}`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .expect(204);

    expect(res.text).toBe('');
    expect(await favoriteRows(product.id)).toBe(0);
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).toBeNull();
  });
});
