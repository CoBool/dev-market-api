import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products find-one (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  async function createProduct(data: {
    name: string;
    description?: string;
    price?: number;
    tags?: string[];
    sellerId?: number;
  }) {
    return prisma.product.create({
      data: {
        name: data.name,
        description: data.description ?? '상세 상품 설명',
        price: data.price ?? 1500,
        tags: data.tags ?? ['상세', '상품'],
        sellerId: data.sellerId ?? userA.id,
      },
    });
  }

  function getProduct(id: string | number) {
    return request(app.getHttpServer()).get(
      `/products/${encodeURIComponent(String(id))}`,
    );
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
      email: 'products-one-a@test.com',
      nickname: 'oneA',
    });
    userB = await createTestUser(app, {
      email: 'products-one-b@test.com',
      nickname: 'oneB',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('성공', () => {
    it('GET /products/:id 응답 키가 정확하고 sellerId가 없음 -> 200', async () => {
      const product = await createProduct({ name: '상세 조회 상품' });

      const res = await getProduct(product.id).expect(200);

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
      expect(res.body).not.toHaveProperty('sellerId');
      expect(Object.keys(res.body.seller).sort()).toEqual(
        ['id', 'nickname'].sort(),
      );
    });

    it('GET /products/:id 응답 상품 값이 DB와 일치 -> 200', async () => {
      const product = await createProduct({
        name: 'DB 저장 상품',
        description: 'DB에 기록한 상세 설명',
        price: 98765,
        tags: ['직접', '확인'],
      });

      const res = await getProduct(product.id).expect(200);

      expect({
        id: res.body.id,
        name: res.body.name,
        description: res.body.description,
        price: res.body.price,
        tags: res.body.tags,
        images: res.body.images,
      }).toEqual({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        tags: product.tags,
        images: product.images,
      });
    });

    it('GET /products/:id B의 실제 판매자 정보 반환 -> 200', async () => {
      const product = await createProduct({
        name: 'B 판매 상품',
        sellerId: userB.id,
      });

      const res = await getProduct(product.id).expect(200);

      expect(res.body.seller).toEqual({ id: userB.id, nickname: 'oneB' });
      expect(Object.keys(res.body.seller).sort()).toEqual(
        ['id', 'nickname'].sort(),
      );
    });

    it('GET /products/:id 생성 시각이 ISO 8601 문자열 -> 200', async () => {
      const product = await createProduct({ name: '시각 확인 상품' });

      const res = await getProduct(product.id).expect(200);

      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(res.body.updatedAt).toEqual(expect.any(String));
      expect(new Date(res.body.createdAt).toISOString()).toBe(
        res.body.createdAt,
      );
      expect(new Date(res.body.updatedAt).toISOString()).toBe(
        res.body.updatedAt,
      );
    });

    it('GET /products/:id 인증 헤더 없이 조회 -> 200', async () => {
      const product = await createProduct({ name: '공개 상세 상품' });

      await getProduct(product.id).expect(200);
    });

    it('GET /products/:id 여러 상품 중 요청한 상품만 반환 -> 200', async () => {
      await createProduct({ name: '다른 상품' });
      const target = await createProduct({
        name: '요청 대상 상품',
        description: '대상 상품 설명',
        sellerId: userB.id,
      });
      await createProduct({ name: '또 다른 상품' });

      const res = await getProduct(target.id).expect(200);

      expect(res.body.id).toBe(target.id);
      expect(res.body.name).toBe('요청 대상 상품');
      expect(res.body.description).toBe('대상 상품 설명');
      expect(res.body.seller).toEqual({ id: userB.id, nickname: 'oneB' });
    });
  });

  describe('찾을 수 없음', () => {
    it('GET /products/:id 존재하지 않는 상품 -> 404', async () => {
      const product = await createProduct({ name: '기준 상품' });

      await getProduct(product.id + 1000).expect(404);
    });

    it('GET /products/:id 삭제된 상품 -> 404', async () => {
      const product = await createProduct({ name: '삭제 대상 상품' });
      await prisma.product.delete({ where: { id: product.id } });

      await getProduct(product.id).expect(404);
    });

    it('GET /products/2147483647 int32 최댓값의 상품 없음 -> 404', async () => {
      await getProduct(2_147_483_647).expect(404);
    });
  });

  describe('id 검증', () => {
    // 숫자만으로 된 양의 십진수 표기만 허용하므로 01과 1e3도 변환 단계에서 거부된다.
    it.each(['0', '-1', 'abc', '1.5', '2147483648', '1e3', '01', ' 1', 'me'])(
      'GET /products/%s 잘못된 id -> 400',
      async (id) => {
        await getProduct(id).expect(400);
      },
    );
  });

  it('GET /products 목록과 상세 조회 응답 필드가 분리됨 -> 200', async () => {
    const product = await createProduct({
      name: '목록 상세 비교 상품',
      description: '상세 응답에만 포함되는 설명',
    });

    const listRes = await request(app.getHttpServer())
      .get('/products')
      .expect(200);
    const detailRes = await getProduct(product.id).expect(200);
    const listed = listRes.body.items.find(
      (item: { id: number }) => item.id === product.id,
    );

    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('description');
    expect(detailRes.body.description).toBe('상세 응답에만 포함되는 설명');
  });
});
