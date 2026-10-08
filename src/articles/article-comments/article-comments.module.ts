import { Module } from '@nestjs/common';
import { ArticleCommentsController } from './article-comments.controller.js';
import { ArticleCommentsService } from './article-comments.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ArticleCommentsController],
  providers: [ArticleCommentsService],
})
export class ArticleCommentsModule {}
