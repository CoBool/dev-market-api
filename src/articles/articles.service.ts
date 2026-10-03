import { Injectable, NotFoundException } from '@nestjs/common';
import type { Article } from '../generated/prisma/client.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Article[]> {
    return this.prisma.article.findMany({
      orderBy: {
        id: 'desc',
      },
    });
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
  ): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: updateArticleDto,
    });
  }

  async remove(id: number): Promise<void> {
    await this.prisma.article.delete({
      where: { id },
    });
  }
}
