import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';
import { buildPageMeta, getSkipTake } from '../common/utils/pagination.js';
import type {
  ArticleOrderBy,
  ArticleSearchType,
  FindArticlesQueryDto,
} from './dto/find-articles-query.dto.js';
import {
  articleArgs,
  type ArticleDetail,
  type ArticleWithWriter,
} from './articles.select.js';
import { escapeLike } from '../common/utils/search.js';

const ARTICLE_ORDER_BY = {
  recent: [{ id: 'desc' }],
  like: [{ likeCount: 'desc' }, { id: 'desc' }],
} satisfies Record<ArticleOrderBy, Prisma.ArticleOrderByWithRelationInput[]>;

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  private async findOwnedArticle(
    id: number,
    userId: number,
    action: '수정' | '삭제',
  ): Promise<void> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { writerId: true },
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (article.writerId !== userId) {
      throw new ForbiddenException(`작성자만 ${action}할 수 있습니다.`);
    }
  }

  async findAll(
    query: FindArticlesQueryDto,
  ): Promise<Paginated<ArticleWithWriter>> {
    const where = this.buildSearchWhere(query.keyword, query.searchType);

    const totalCount = await this.prisma.article.count({ where });
    const meta = buildPageMeta(query, totalCount);

    if (query.page > meta.totalPages) {
      return { items: [], meta };
    }

    const { skip, take } = getSkipTake(query);

    const items = await this.prisma.article.findMany({
      where,
      orderBy: ARTICLE_ORDER_BY[query.orderBy],
      skip,
      take,
      ...articleArgs,
    });

    return { items, meta };
  }

  async findOne(id: number, userId?: number): Promise<ArticleDetail> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        ...articleArgs.include,
        likes: userId ? { where: { userId }, select: { userId: true } } : false,
      },
      omit: articleArgs.omit,
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    const { likes, ...rest } = article;

    return { ...rest, isLiked: userId ? likes.length > 0 : false };
  }

  async create(
    createArticleDto: CreateArticleDto,
    writerId: number,
  ): Promise<ArticleWithWriter> {
    const { title, content } = createArticleDto;

    return this.prisma.article.create({
      data: { title, content, writerId },
      ...articleArgs,
    });
  }

  async update(
    id: number,
    updateArticleDto: UpdateArticleDto,
    userId: number,
  ): Promise<ArticleWithWriter> {
    if (!updateArticleDto || Object.keys(updateArticleDto).length === 0) {
      throw new BadRequestException('수정할 내용이 없습니다.');
    }
    await this.findOwnedArticle(id, userId, '수정');

    return this.prisma.article.update({
      where: { id },
      data: updateArticleDto,
      ...articleArgs,
    });
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.findOwnedArticle(id, userId, '삭제');

    await this.prisma.article.delete({
      where: { id },
    });
  }

  async like(id: number, userId: number): Promise<ArticleDetail> {
    try {
      const article = await this.prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<{ id: number; updatedAt: Date }[]>`
          SELECT id, "updatedAt"
          FROM "Article"
          WHERE id = ${id}
          FOR UPDATE
        `;

        if (!locked) {
          throw new NotFoundException('게시글을 찾을 수 없습니다.');
        }

        await tx.articleLike.create({ data: { userId, articleId: id } });

        return tx.article.update({
          where: { id },
          data: { likeCount: { increment: 1 }, updatedAt: locked.updatedAt },
          ...articleArgs,
        });
      });

      return {
        ...article,
        isLiked: true,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 좋아요한 게시글입니다.');
      }
      throw error;
    }
  }

  async unlike(id: number, userId: number): Promise<ArticleDetail> {
    const article = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: number; updatedAt: Date }[]>`
          SELECT id, "updatedAt"
          FROM "Article"
          WHERE id = ${id}
          FOR UPDATE
        `;

      if (!locked) {
        throw new NotFoundException('게시글을 찾을 수 없습니다.');
      }

      const { count } = await tx.articleLike.deleteMany({
        where: { userId, articleId: id },
      });

      if (count === 0)
        throw new ConflictException('좋아요하지 않은 게시글입니다.');

      return tx.article.update({
        where: { id },
        data: { likeCount: { decrement: 1 }, updatedAt: locked.updatedAt },
        ...articleArgs,
      });
    });

    return {
      ...article,
      isLiked: false,
    };
  }

  private buildSearchWhere(
    keyword: string | undefined,
    searchType: ArticleSearchType,
  ): Prisma.ArticleWhereInput {
    // 검색어가 없으면 조건 없음 (전체 목록)
    if (!keyword) return {};

    const escaped = escapeLike(keyword);

    const conditions: Prisma.ArticleWhereInput[] = [];

    if (searchType === 'title' || searchType === 'all') {
      conditions.push({ title: { contains: escaped, mode: 'insensitive' } });
    }

    if (searchType === 'content' || searchType === 'all') {
      conditions.push({ content: { contains: escaped, mode: 'insensitive' } });
    }

    return { OR: conditions };
  }
}
