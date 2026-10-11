import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CreateProductDto } from './dto/create-product.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import type { ProductWithSeller } from './products.select.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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
