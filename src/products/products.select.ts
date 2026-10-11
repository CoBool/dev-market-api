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
