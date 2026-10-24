import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type ArticleLikeStatus = {
  articleId: number;
  isLiked: boolean;
  likeCount: number;
};

@Injectable()
export class ArticleLikesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(articleId: number, userId: number): Promise<ArticleLikeStatus> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: {
        likeCount: true,
        likes: { where: { userId }, select: { userId: true } },
      },
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    return {
      articleId,
      likeCount: article.likeCount,
      isLiked: article.likes.length > 0,
    };
  }

  async like(articleId: number, userId: number): Promise<ArticleLikeStatus> {
    const likeCount = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { id: number; likeCount: number; updatedAt: Date }[]
      >`
        SELECT id, "likeCount", "updatedAt"
        FROM "Article"
        WHERE id = ${articleId}
        FOR UPDATE
      `;

      if (!locked) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      const { count } = await tx.articleLike.createMany({
        data: [{ userId, articleId }],
        skipDuplicates: true,
      });

      if (count === 0) {
        return locked.likeCount;
      }

      const updated = await tx.article.update({
        where: { id: articleId },
        data: { likeCount: { increment: 1 }, updatedAt: locked.updatedAt },
        select: { likeCount: true },
      });

      return updated.likeCount;
    });

    return { articleId, isLiked: true, likeCount };
  }

  async unlike(articleId: number, userId: number): Promise<ArticleLikeStatus> {
    const likeCount = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { id: number; likeCount: number; updatedAt: Date }[]
      >`
      SELECT id, "likeCount", "updatedAt"
      FROM "Article"
      WHERE id = ${articleId}
      FOR UPDATE
      `;

      if (!locked) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      const { count } = await tx.articleLike.deleteMany({
        where: { userId, articleId },
      });

      if (count === 0) {
        return locked.likeCount;
      }

      const updated = await tx.article.update({
        where: { id: articleId },
        data: { likeCount: { decrement: 1 }, updatedAt: locked.updatedAt },
        select: { likeCount: true },
      });

      return updated.likeCount;
    });

    return { articleId, isLiked: false, likeCount };
  }
}
