import { Module } from '@nestjs/common';
import {
  MyProductsController,
  ProductsController,
} from './products.controller.js';
import { ProductsService } from './products.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProductCommentsModule } from './product-comments/product-comments.module.js';
import { ProductFavoritesModule } from './product-favorites/product-favorites.module.js';

@Module({
  imports: [PrismaModule, ProductCommentsModule, ProductFavoritesModule],
  controllers: [ProductsController, MyProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
