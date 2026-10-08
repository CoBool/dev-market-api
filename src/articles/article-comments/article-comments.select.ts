import type { Prisma } from '../../generated/prisma/client.js';

export const articleCommentArgs = {
  include: {
    writer: { select: { id: true, nickname: true } },
  },
  omit: { writerId: true },
} satisfies Prisma.ArticleCommentDefaultArgs;

export type ArticleCommentWithWriter = Prisma.ArticleCommentGetPayload<
  typeof articleCommentArgs
>;
