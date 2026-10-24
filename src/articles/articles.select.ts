import type { Prisma } from '../generated/prisma/client.js';

export const articleArgs = {
  include: {
    writer: {
      select: { id: true, nickname: true },
    },
  },
  omit: { writerId: true },
} satisfies Prisma.ArticleDefaultArgs;

export type ArticleWithWriter = Prisma.ArticleGetPayload<typeof articleArgs>;
