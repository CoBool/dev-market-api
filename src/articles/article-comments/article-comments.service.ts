import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateArticleCommentDto } from './dto/create-article-comment.dto.js';
import {
  articleCommentArgs,
  type ArticleCommentWithWriter,
} from './article-comments.select.js';

@Injectable()
export class ArticleCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    articleId: number,
    createArticleCommentDto: CreateArticleCommentDto,
    writerId: number,
  ): Promise<ArticleCommentWithWriter> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });

    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    const { content } = createArticleCommentDto;

    return this.prisma.articleComment.create({
      data: { content, articleId, writerId },
      ...articleCommentArgs,
    });
  }
}
