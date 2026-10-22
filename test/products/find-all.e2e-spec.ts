import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products find-all (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  async function createProduct(data: {
    name: string;
    description?: string;
    tags?: string[];
    sellerId?: number;
    favoriteCount?: number;
  }) {
    return prisma.product.create({
      data: {
        name: data.name,
        description: data.description ?? '일반 상품 설명',
        price: 1000,
        tags: data.tags ?? ['기본'],
        sellerId: data.sellerId ?? userA.id,
        favoriteCount: data.favoriteCount ?? 0,
      },
    });
  }

  function getProducts(query?: Record<string, string>) {
    const req = request(app.getHttpServer()).get('/products');
    return query ? req.query(query) : req;
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
      email: 'products-find-a@test.com',
      nickname: 'findA',
    });
    userB = await createTestUser(app, {
      email: 'products-find-b@test.com',
      nickname: 'findB',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('응답 모양과 접근', () => {
    it('GET /products 목록 요소는 정해진 키만 반환 -> 200', async () => {
      const productA = await createProduct({ name: 'A 상품' });
      const productB = await createProduct({
        name: 'B 상품',
        sellerId: userB.id,
      });

      const res = await getProducts().expect(200);

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
      expect(Object.keys(res.body.items[0].seller).sort()).toEqual(
        ['id', 'nickname'].sort(),
      );
      expect(res.body.items[0].seller).toEqual({
        id: userB.id,
        nickname: 'findB',
      });
      expect(res.body.items[1].seller).toEqual({
        id: userA.id,
        nickname: 'findA',
      });
      expect(res.body.items[0].id).toBe(productB.id);
      expect(res.body.items[1].id).toBe(productA.id);
      expect(res.body.items[0].favoriteCount).toBe(0);
      expect(res.body.items[0]).not.toHaveProperty('description');
      expect(res.body.items[0]).not.toHaveProperty('updatedAt');
      expect(res.body.items[0]).not.toHaveProperty('sellerId');
    });

    it('GET /products 인증 헤더 없이 조회 -> 200', async () => {
      await createProduct({ name: '공개 상품' });

      await getProducts().expect(200);
    });
  });

  describe('정렬과 페이지네이션', () => {
    it('GET /products 최신순 정렬 -> 200', async () => {
      const first = await createProduct({ name: '첫 상품' });
      const second = await createProduct({ name: '둘째 상품' });
      const third = await createProduct({ name: '셋째 상품' });

      const res = await getProducts().expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual([
        third.id,
        second.id,
        first.id,
      ]);
    });

    it('GET /products 쿼리 없이 기본 페이지 값 -> 200', async () => {
      await createProduct({ name: '기본 상품' });

      const res = await getProducts().expect(200);

      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        totalCount: 1,
        totalPages: 1,
      });
    });

    it('GET /products?limit=10 상품 15개 첫 페이지 -> 200', async () => {
      for (let index = 1; index <= 15; index += 1) {
        await createProduct({ name: `상품 ${index}` });
      }

      const res = await getProducts({ limit: '10' }).expect(200);

      expect(res.body.items).toHaveLength(10);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        totalCount: 15,
        totalPages: 2,
      });
    });

    it('GET /products?page=2&limit=10 첫 페이지와 중복 없이 조회 -> 200', async () => {
      for (let index = 1; index <= 15; index += 1) {
        await createProduct({ name: `페이지 상품 ${index}` });
      }

      const firstPage = await getProducts({ limit: '10' }).expect(200);
      const secondPage = await getProducts({ page: '2', limit: '10' }).expect(
        200,
      );
      const firstIds = firstPage.body.items.map(
        (item: { id: number }) => item.id,
      );
      const secondIds = secondPage.body.items.map(
        (item: { id: number }) => item.id,
      );

      expect(secondPage.body.items).toHaveLength(5);
      expect(secondIds.every((id: number) => !firstIds.includes(id))).toBe(
        true,
      );
    });

    it('GET /products?page=999 빈 페이지와 전체 개수 -> 200', async () => {
      await createProduct({ name: '페이지 초과 상품' });

      const res = await getProducts({ page: '999' }).expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta).toEqual({
        page: 999,
        limit: 10,
        totalCount: 1,
        totalPages: 1,
      });
    });

    it('GET /products 상품이 없으면 빈 목록 -> 200', async () => {
      const res = await getProducts().expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        totalCount: 0,
        totalPages: 0,
      });
    });

    it('GET /products 페이지 메타 값은 number 타입 -> 200', async () => {
      const res = await getProducts({ page: '2', limit: '3' }).expect(200);

      expect(typeof res.body.meta.page).toBe('number');
      expect(typeof res.body.meta.limit).toBe('number');
    });
  });

  describe('GET /products orderBy 정렬', () => {
    async function createProducts(favoriteCounts: number[]) {
      const products = [];
      for (const [index, favoriteCount] of favoriteCounts.entries()) {
        products.push(
          await createProduct({
            name: `orderBy 상품 ${index + 1}`,
            favoriteCount,
          }),
        );
      }
      return products;
    }

    function getProductAt(
      products: Awaited<ReturnType<typeof createProducts>>,
      index: number,
    ) {
      const product = products[index];
      if (!product) throw new Error(`정렬 테스트 상품 ${index}번이 없습니다.`);
      return product;
    }

    function getExpectedFavoriteIds(
      products: Awaited<ReturnType<typeof createProducts>>,
    ) {
      return [...products]
        .sort((a, b) => b.favoriteCount - a.favoriteCount || b.id - a.id)
        .map((product) => product.id);
    }

    it('GET /products orderBy 생략 -> 기본 recent, id 내림차순 -> 200', async () => {
      const products = await createProducts([0, 0, 0]);
      const expectedIds = products.map((product) => product.id).reverse();

      const res = await getProducts({ limit: '50' }).expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
        expectedIds,
      );
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
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 50,
        totalCount: 3,
        totalPages: 1,
      });
    });

    it('GET /products?orderBy=recent -> id 내림차순 -> 200', async () => {
      const products = await createProducts([0, 0, 0]);
      const expectedIds = products.map((product) => product.id).reverse();

      const res = await getProducts({ orderBy: 'recent', limit: '50' }).expect(
        200,
      );

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
        expectedIds,
      );
    });

    it('GET /products?orderBy=favorite -> favoriteCount 내림차순 -> 200', async () => {
      const products = await createProducts([3, 10, 0, 7]);
      const expectedIds = [
        getProductAt(products, 1).id,
        getProductAt(products, 3).id,
        getProductAt(products, 0).id,
        getProductAt(products, 2).id,
      ];

      const res = await getProducts({
        orderBy: 'favorite',
        limit: '50',
      }).expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
        expectedIds,
      );
    });

    it('GET /products?orderBy=favorite favoriteCount가 같으면 id 내림차순 -> 200', async () => {
      const products = await createProducts([3, 8, 3, 3, 8, 3]);
      const expectedIds = getExpectedFavoriteIds(products);

      const res = await getProducts({
        orderBy: 'favorite',
        limit: '50',
      }).expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
        expectedIds,
      );
    });

    it('GET /products?orderBy=favorite&page&limit 페이지 경계에서도 전체 정렬 유지 -> 200', async () => {
      const favoriteCounts = Array.from({ length: 25 }, (_, index) => {
        if (index < 8) return 10;
        if (index < 13) return 9;
        return 7 - Math.floor((index - 13) / 4);
      });
      const products = await createProducts(favoriteCounts);
      const expectedIds = getExpectedFavoriteIds(products);
      const receivedIds: number[] = [];

      for (const page of [1, 2, 3]) {
        const res = await getProducts({
          orderBy: 'favorite',
          page: String(page),
          limit: '10',
        }).expect(200);
        const pageIds = res.body.items.map((item: { id: number }) => item.id);
        receivedIds.push(...pageIds);

        expect(pageIds).toEqual(expectedIds.slice((page - 1) * 10, page * 10));
        expect(res.body.meta).toEqual({
          page,
          limit: 10,
          totalCount: 25,
          totalPages: 3,
        });
      }

      expect(new Set(receivedIds).size).toBe(25);
      expect(receivedIds).toEqual(expectedIds);
    });

    it('GET /products?orderBy=favorite&keyword 검색 결과 안에서 favorite 정렬 -> 200', async () => {
      const products = [];
      for (const row of [
        { name: '검색 낮은 찜', favoriteCount: 1 },
        { name: '다른 주제 높은 찜', favoriteCount: 9 },
        { name: '검색 높은 찜', favoriteCount: 6 },
        { name: '다른 주제 낮은 찜', favoriteCount: 0 },
      ]) {
        products.push(await createProduct(row));
      }
      const expectedIds = [
        getProductAt(products, 2).id,
        getProductAt(products, 0).id,
      ];

      const res = await getProducts({
        orderBy: 'favorite',
        keyword: '검색',
        limit: '50',
      }).expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
        expectedIds,
      );
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 50,
        totalCount: 2,
        totalPages: 1,
      });
    });

    it.each([
      ['price', 'price'],
      ['FAVORITE', 'FAVORITE'],
      ['빈 값', ''],
    ])(
      'GET /products?orderBy=%s 허용하지 않은 값 -> 400',
      async (_label, orderBy) => {
        await getProducts({ orderBy }).expect(400);
      },
    );

    it('GET /products?orderBy=favorite&orderBy=recent orderBy 배열 -> 400', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .query({ orderBy: ['favorite', 'recent'] })
        .expect(400);
    });
  });

  describe('검색', () => {
    it('GET /products?keyword=React 이름에 포함된 상품 검색 -> 200', async () => {
      await createProduct({ name: 'React 템플릿' });
      await createProduct({ name: 'Vue 템플릿' });

      const res = await getProducts({ keyword: 'React' }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['React 템플릿'],
      );
    });

    it('GET /products?keyword=특별 설명에만 포함된 상품 검색 -> 200', async () => {
      await createProduct({ name: '책상', description: '특별한 수납 설명' });
      await createProduct({ name: '의자', description: '편안한 설명' });

      const res = await getProducts({ keyword: '특별한 수납' }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['책상'],
      );
    });

    it('GET /products?keyword=REACT 대소문자 구분 없이 검색 -> 200', async () => {
      await createProduct({ name: 'React 템플릿' });
      await createProduct({ name: 'Angular 템플릿' });

      const res = await getProducts({ keyword: 'REACT' }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['React 템플릿'],
      );
    });

    it('GET /products?keyword=태그검색어 태그만 일치하면 제외 -> 200', async () => {
      await createProduct({ name: '상품 이름', tags: ['검색어'] });

      const res = await getProducts({ keyword: '검색어' }).expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalCount).toBe(0);
    });

    it.each([
      ['퍼센트', '%', '50% 할인 상품'],
      ['밑줄', '_', 'snake_case 상품'],
      ['백슬래시', '\\', 'C:\\경로 상품'],
    ])(
      'GET /products?keyword=%s 특수문자 글자 그대로 검색 -> 200',
      async (_label, keyword, matchingName) => {
        await createProduct({ name: matchingName });
        await createProduct({ name: '특수문자 없는 상품' });

        const res = await getProducts({ keyword }).expect(200);

        expect(
          res.body.items.map((item: { name: string }) => item.name),
        ).toEqual([matchingName]);
      },
    );

    it('GET /products?keyword=+React+ 앞뒤 공백을 제거해 검색 -> 200', async () => {
      await createProduct({ name: 'React 템플릿' });
      await createProduct({ name: 'Vue 템플릿' });

      const res = await getProducts({ keyword: '  React  ' }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['React 템플릿'],
      );
    });

    it('GET /products?keyword=공백 공백만 있는 검색어는 전체 목록 -> 200', async () => {
      await createProduct({ name: '공백 상품 A' });
      await createProduct({ name: '공백 상품 B' });

      const res = await getProducts({ keyword: '   ' }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['공백 상품 B', '공백 상품 A'],
      );
      expect(res.body.meta.totalCount).toBe(2);
    });

    it('GET /products?keyword=검색&limit=2 검색 결과 기준으로 페이지네이션 -> 200', async () => {
      await createProduct({ name: '검색 이전 글' });
      await createProduct({ name: '매칭 상품 1' });
      await createProduct({ name: '검색 중간 글' });
      await createProduct({ name: '매칭 상품 2' });
      await createProduct({ name: '매칭 상품 3' });
      await createProduct({ name: '검색 마지막 글' });
      await createProduct({ name: '매칭 상품 4' });

      const res = await getProducts({
        keyword: '매칭 상품',
        page: '2',
        limit: '2',
      }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['매칭 상품 2', '매칭 상품 1'],
      );
      expect(res.body.meta).toEqual({
        page: 2,
        limit: 2,
        totalCount: 4,
        totalPages: 2,
      });
    });

    it('GET /products?keyword=일치하지않음 결과 없음 -> 200', async () => {
      await createProduct({ name: '다른 상품' });

      const res = await getProducts({ keyword: '일치하지않음' }).expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalCount).toBe(0);
    });
  });

  describe('쿼리 검증', () => {
    it('GET /products?keyword=50자 키워드 -> 200', async () => {
      const keyword = '가'.repeat(50);
      await createProduct({ name: '경계 상품', description: keyword });

      const res = await getProducts({ keyword }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['경계 상품'],
      );
    });

    it('GET /products?keyword=51자 키워드 -> 400', async () => {
      await getProducts({ keyword: '가'.repeat(51) }).expect(400);
    });

    it('GET /products?keyword=+50자+ 앞뒤 공백을 제외한 50자 -> 200', async () => {
      const keyword = '가'.repeat(50);
      await createProduct({ name: '경계 상품', description: keyword });
      await createProduct({ name: '다른 상품' });

      const res = await getProducts({ keyword: `  ${keyword}  ` }).expect(200);

      expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(
        ['경계 상품'],
      );
    });

    it('GET /products?keyword=+51자+ 앞뒤 공백을 제외해도 51자 -> 400', async () => {
      await getProducts({ keyword: `  ${'가'.repeat(51)}  ` }).expect(400);
    });

    it.each([
      ['limit=0', { limit: '0' }],
      ['limit=51', { limit: '51' }],
      ['page=0', { page: '0' }],
      ['page=abc', { page: 'abc' }],
      ['limit=1.5', { limit: '1.5' }],
    ])('GET /products?%s 잘못된 페이지 쿼리 -> 400', async (_name, query) => {
      await getProducts(query).expect(400);
    });

    it('GET /products?foo=1 알 수 없는 쿼리 -> 400', async () => {
      await getProducts({ foo: '1' }).expect(400);
    });
  });
});
