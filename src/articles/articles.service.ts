import { Injectable, NotFoundException } from '@nestjs/common';
import type { Article } from './interfaces/article.interface.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}
  private nextId = 3;
  private articles: Article[] = [
    {
      id: 1,
      title: '안녕하세요',
      content: '반가워요',
      createdAt: new Date(),
    },
    {
      id: 2,
      title: '잘있어요',
      content: '다시만나요',
      createdAt: new Date(),
    },
  ];
  async findAll(): Promise<Article[]> {
    return this.prisma.article.findMany();
  }

  findOne(id: number): Article {
    const article = this.articles.find((article) => article.id === id);

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    return article;
  }

  async create(createArticleDto: CreateArticleDto): Promise<Article> {
    const { title, content } = createArticleDto;

    return this.prisma.article.create({
      data: { title, content },
    });
  }

  update(id: number, updateArticleDto: UpdateArticleDto): Article {
    const article = this.findOne(id);

    Object.assign(article, updateArticleDto);

    return article;
  }

  remove(id: number): void {
    this.findOne(id);

    this.articles = this.articles.filter((article) => article.id !== id);
  }
}
