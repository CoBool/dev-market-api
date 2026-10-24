import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ArticleCommentsModule } from './article-comments/article-comments.module.js';
import { ArticleLikesModule } from './article-likes/article-likes.module.js';

@Module({
  imports: [PrismaModule, ArticleCommentsModule, ArticleLikesModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
})
export class ArticlesModule {}
