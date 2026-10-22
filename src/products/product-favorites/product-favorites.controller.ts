import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ProductFavoritesService,
  type ProductFavoriteStatus,
} from './product-favorites.service.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';

@Controller('products/:id/favorite')
export class ProductFavoritesController {
  constructor(
    private readonly productFavoritesService: ProductFavoritesService,
  ) {}

  @Get()
  findOne(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductFavoriteStatus> {
    return this.productFavoritesService.findOne(id, user.id);
  }

  @Put()
  favorite(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductFavoriteStatus> {
    return this.productFavoritesService.favorite(id, user.id);
  }

  @Delete()
  @HttpCode(200)
  unfavorite(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductFavoriteStatus> {
    return this.productFavoritesService.unfavorite(id, user.id);
  }
}
