import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDatabase } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

describe('Products remove (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

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
        name: data.name ?? '삭제 테스트 상품',
        description: data.description ?? '삭제 테스트 설명',
        price: data.price ?? 1800,
        tags: data.tags ?? ['remove'],
        sellerId: data.sellerId ?? userA.id,
      },
    });
  }

  function deleteProduct(id: string | number, token?: string) {
    const req = request(app.getHttpServer()).delete(
      `/products/${encodeURIComponent(String(id))}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
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
      email: 'products-remove-a@test.com',
      nickname: 'rmA',
    });
    userB = await createTestUser(app, {
      email: 'products-remove-b@test.com',
      nickname: 'rmB',
    });
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('성공', () => {
    it('DELETE /products/:id 판매자가 삭제 -> 204, 빈 응답과 DB 삭제', async () => {
      const product = await createProduct();

      const res = await deleteProduct(product.id, userA.accessToken).expect(
        204,
      );

      expect(res.text).toBe('');
      expect(
        await prisma.product.findUnique({ where: { id: product.id } }),
      ).toBeNull();
    });

    it('DELETE /products/:id 삭제 후 상세와 목록에서 제외 -> 204', async () => {
      const product = await createProduct();

      await deleteProduct(product.id, userA.accessToken).expect(204);

      await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(404);
      const listRes = await request(app.getHttpServer())
        .get('/products')
        .expect(200);
      expect(
        listRes.body.items.some(
          (item: { id: number }) => item.id === product.id,
        ),
      ).toBe(false);
    });

    it('DELETE /products/:id 다른 상품과 다른 판매자 상품은 유지 -> 204', async () => {
      const target = await createProduct({ name: '삭제 대상' });
      const otherA = await createProduct({ name: 'A의 다른 상품' });
      const otherB = await createProduct({
        name: 'B의 상품',
        sellerId: userB.id,
      });

      await deleteProduct(target.id, userA.accessToken).expect(204);

      await expectUnchanged(otherA.id, otherA);
      await expectUnchanged(otherB.id, otherB);
    });

    it('DELETE /products/:id 같은 상품을 두 번 삭제 -> 두 번째 404', async () => {
      const product = await createProduct();

      await deleteProduct(product.id, userA.accessToken).expect(204);
      const res = await deleteProduct(product.id, userA.accessToken).expect(
        404,
      );

      expect(res.body.message).toBe('상품을 찾을 수 없습니다.');
      expect(
        await prisma.product.findUnique({ where: { id: product.id } }),
      ).toBeNull();
    });
  });

  describe('인증과 권한', () => {
    it('DELETE /products/:id 토큰 없음 -> 401', async () => {
      const product = await createProduct();

      await deleteProduct(product.id).expect(401);
      await expectUnchanged(product.id, product);
    });

    it('DELETE /products/:id 잘못된 토큰 -> 401', async () => {
      const product = await createProduct();

      await deleteProduct(product.id, 'invalid-token').expect(401);
      await expectUnchanged(product.id, product);
    });

    it('DELETE /products/:id B가 A의 상품 삭제 시도 -> 403', async () => {
      const product = await createProduct();

      const res = await deleteProduct(product.id, userB.accessToken).expect(
        403,
      );

      expect(res.body.message).toBe('판매자만 삭제할 수 있습니다.');
      await expectUnchanged(product.id, product);
    });

    it('DELETE /products/:id 없는 상품 -> 404', async () => {
      const control = await createProduct({ name: '유지할 상품' });

      const res = await deleteProduct(
        control.id + 1000,
        userA.accessToken,
      ).expect(404);

      expect(res.body.message).toBe('상품을 찾을 수 없습니다.');
      await expectUnchanged(control.id, control);
    });
  });

  it.each(['0', 'abc'])('DELETE /products/%s 잘못된 id -> 400', async (id) => {
    const product = await createProduct();

    await deleteProduct(id, userA.accessToken).expect(400);
    await expectUnchanged(product.id, product);
  });
});
