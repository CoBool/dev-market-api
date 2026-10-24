import { Module } from '@nestjs/common';
import { ArticleLikesService } from './article-likes.service.js';
import { ArticleLikesController } from './article-likes.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [ArticleLikesService],
  controllers: [ArticleLikesController],
})
export class ArticleLikesModule {}
