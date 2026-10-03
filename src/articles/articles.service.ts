import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Article, Prisma } from '../generated/prisma/client.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';
import { buildPageMeta, getSkipTake } from '../common/utils/pagination.js';
import type {
  ArticleSearchType,
  FindArticlesQueryDto,
} from './dto/find-articles-query.dto.js';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindArticlesQueryDto): Promise<Paginated<Article>> {
    const { skip, take } = getSkipTake(query);
    const where = this.buildSearchWhere(query.keyword, query.searchType);

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        orderBy: {
          id: 'desc',
        },
        skip,
        take,
      }),

      // 목록과 같은 조건으로 세야 totalCount/totalPages가 검색 결과와 맞음
      this.prisma.article.count({ where }),
    ]);

    return {
      items,
      meta: buildPageMeta(query, totalCount),
    };
  }

  async findOne(id: number): Promise<Article> {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    return article;
  }

  async create(
    createArticleDto: CreateArticleDto,
    writerId: number,
  ): Promise<Article> {
    const { title, content } = createArticleDto;

    return this.prisma.article.create({
      data: { title, content, writerId },
    });
  }

  async update(
    id: number,
    updateArticleDto: UpdateArticleDto,
    userId: number,
  ): Promise<Article> {
    if (!updateArticleDto || Object.keys(updateArticleDto).length === 0) {
      throw new BadRequestException('수정할 내용이 없습니다.');
    }
    const article = await this.findOne(id);

    if (article.writerId !== userId) {
      throw new ForbiddenException('작성자만 수정할 수 있습니다.');
    }

    return this.prisma.article.update({
      where: { id },
      data: updateArticleDto,
    });
  }

  async remove(id: number, userId: number): Promise<void> {
    const article = await this.findOne(id);

    if (article.writerId !== userId) {
      throw new ForbiddenException('작성자만 삭제할 수 있습니다.');
    }

    await this.prisma.article.delete({
      where: { id },
    });
  }

  private buildSearchWhere(
    keyword: string | undefined,
    searchType: ArticleSearchType,
  ): Prisma.ArticleWhereInput {
    // 검색어가 없으면 조건 없음 (전체 목록)
    if (!keyword) return {};

    const conditions: Prisma.ArticleWhereInput[] = [];

    if (searchType === 'title' || searchType === 'all') {
      conditions.push({ title: { contains: keyword, mode: 'insensitive' } });
    }

    if (searchType === 'content' || searchType === 'all') {
      conditions.push({ content: { contains: keyword, mode: 'insensitive' } });
    }

    return { OR: conditions };
  }
}
