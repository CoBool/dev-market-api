import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Article } from '../generated/prisma/client.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';
import { buildPageMeta, getSkipTake } from '../common/utils/pagination.js';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto): Promise<Paginated<Article>> {
    const { skip, take } = getSkipTake(query);

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        orderBy: {
          id: 'desc',
        },
        skip,
        take,
      }),

      this.prisma.article.count(),
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
}
