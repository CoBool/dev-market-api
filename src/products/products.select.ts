import type { Prisma } from '../generated/prisma/client.js';

export const productArgs = {
  include: {
    seller: {
      select: { id: true, nickname: true },
    },
  },
  omit: { sellerId: true },
} satisfies Prisma.ProductDefaultArgs;

export type ProductWithSeller = Prisma.ProductGetPayload<typeof productArgs>;

// 목록 카드용. 상세에 필드가 늘어도 목록이 따라 커지지 않도록 필요한 필드만 고른다.
export const productListArgs = {
  select: {
    id: true,
    name: true,
    price: true,
    tags: true,
    images: true,
    createdAt: true,
    favoriteCount: true,
    seller: { select: { id: true, nickname: true } },
  },
} satisfies Prisma.ProductDefaultArgs;

export type ProductListItem = Prisma.ProductGetPayload<typeof productListArgs>;
