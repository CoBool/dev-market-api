import { Module } from '@nestjs/common';
import { ProductFavoritesController } from './product-favorites.controller.js';
import { ProductFavoritesService } from './product-favorites.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProductFavoritesController],
  providers: [ProductFavoritesService],
})
export class ProductFavoritesModule {}
