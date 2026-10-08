import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateArticleCommentDto } from './dto/create-article-comment.dto.js';
import {
  articleCommentArgs,
  type ArticleCommentWithWriter,
} from './article-comments.select.js';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto.js';
import type { CursorPaginated } from '../../common/interfaces/cursor-paginated.interface.js';

@Injectable()
export class ArticleCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureArticleExists(articleId: number): Promise<void> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');
  }

  async create(
    articleId: number,
    createArticleCommentDto: CreateArticleCommentDto,
    writerId: number,
  ): Promise<ArticleCommentWithWriter> {
    await this.ensureArticleExists(articleId);

    const { content } = createArticleCommentDto;

    return this.prisma.articleComment.create({
      data: { content, articleId, writerId },
      ...articleCommentArgs,
    });
  }

  async findAll(
    articleId: number,
    query: CursorPaginationQueryDto,
  ): Promise<CursorPaginated<ArticleCommentWithWriter>> {
    await this.ensureArticleExists(articleId);

    const { cursor, limit } = query;

    const rows = await this.prisma.articleComment.findMany({
      where: {
        articleId,
        id: cursor ? { gt: cursor } : undefined,
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...articleCommentArgs,
    });

    const hasNext = rows.length > limit;

    const items = hasNext ? rows.slice(0, limit) : rows;

    const nextCursor = hasNext ? (items.at(-1)?.id ?? null) : null;

    return { items, meta: { nextCursor } };
  }
}
