import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProductCommentsModule } from './product-comments/product-comments.module.js';

@Module({
  imports: [PrismaModule, ProductCommentsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
