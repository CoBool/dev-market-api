import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';
import { buildPageMeta, getSkipTake } from '../common/utils/pagination.js';
import type {
  ArticleSearchType,
  FindArticlesQueryDto,
} from './dto/find-articles-query.dto.js';
import { articleArgs, type ArticleWithWriter } from './articles.select.js';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

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
      orderBy: {
        id: 'desc',
      },
      skip,
      take,
      ...articleArgs,
    });

    return { items, meta };
  }

  async findOne(id: number): Promise<ArticleWithWriter> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      ...articleArgs,
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    return article;
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
    const article = await this.findOne(id);

    if (article.writer.id !== userId) {
      throw new ForbiddenException('작성자만 수정할 수 있습니다.');
    }

    return this.prisma.article.update({
      where: { id },
      data: updateArticleDto,
      ...articleArgs,
    });
  }

  async remove(id: number, userId: number): Promise<void> {
    const article = await this.findOne(id);

    if (article.writer.id !== userId) {
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

    const escaped = keyword.replace(/[\\%_]/g, '\\$&');

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
