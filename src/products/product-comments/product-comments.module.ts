import { Module } from '@nestjs/common';
import { ProductCommentsController } from './product-comments.controller.js';
import { ProductCommentsService } from './product-comments.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProductCommentsController],
  providers: [ProductCommentsService],
})
export class ProductCommentsModule {}
