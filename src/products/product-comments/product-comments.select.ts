import type { Prisma } from '../../generated/prisma/client.js';

export const productCommentArgs = {
  include: {
    writer: { select: { id: true, nickname: true } },
  },
  omit: { writerId: true },
} satisfies Prisma.ProductCommentDefaultArgs;

export type ProductCommentWithWriter = Prisma.ProductCommentGetPayload<
  typeof productCommentArgs
>;
