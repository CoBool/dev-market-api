import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
})
export class ArticlesModule {}
