import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type ProductFavoriteStatus = {
  productId: number;
  isFavorite: boolean;
  favoriteCount: number;
};

@Injectable()
export class ProductFavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(
    productId: number,
    userId: number,
  ): Promise<ProductFavoriteStatus> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        favoriteCount: true,
        favorites: { where: { userId }, select: { userId: true } },
      },
    });

    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다.');

    return {
      productId,
      favoriteCount: product.favoriteCount,
      isFavorite: product.favorites.length > 0,
    };
  }

  async favorite(
    productId: number,
    userId: number,
  ): Promise<ProductFavoriteStatus> {
    const favoriteCount = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { id: number; favoriteCount: number; updatedAt: Date }[]
      >`
        SELECT id, "favoriteCount", "updatedAt"
        FROM "Product"
        WHERE id = ${productId}
        FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundException('상품을 찾을 수 없습니다.');
      }

      const { count } = await tx.productFavorite.createMany({
        data: [{ userId, productId }],
        skipDuplicates: true,
      });

      if (count === 0) {
        return locked.favoriteCount;
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: { favoriteCount: { increment: 1 }, updatedAt: locked.updatedAt },
        select: { favoriteCount: true },
      });

      return updated.favoriteCount;
    });

    return { productId, isFavorite: true, favoriteCount };
  }

  async unfavorite(
    productId: number,
    userId: number,
  ): Promise<ProductFavoriteStatus> {
    const favoriteCount = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { id: number; favoriteCount: number; updatedAt: Date }[]
      >`
        SELECT id, "favoriteCount", "updatedAt"
        FROM "Product"
        WHERE id = ${productId}
        FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundException('상품을 찾을 수 없습니다.');
      }

      const { count } = await tx.productFavorite.deleteMany({
        where: { userId, productId },
      });

      if (count === 0) {
        return locked.favoriteCount;
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: { favoriteCount: { decrement: 1 }, updatedAt: locked.updatedAt },
        select: { favoriteCount: true },
      });

      return updated.favoriteCount;
    });

    return { productId, isFavorite: false, favoriteCount };
  }
}
