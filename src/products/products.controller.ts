import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CreateProductDto } from './dto/create-product.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import type { ProductWithSeller, ProductListItem } from './products.select.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { FindProductsQueryDto } from './dto/find-products-query.dto.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  findAll(
    @Query() query: FindProductsQueryDto,
  ): Promise<Paginated<ProductListItem>> {
    return this.productsService.findAll(query);
  }

  @Post()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 10_000 } })
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductWithSeller> {
    return this.productsService.create(createProductDto, user.id);
  }
}
