import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductCommentsService } from './product-comments.service.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto.js';
import type { CursorPaginated } from '../../common/interfaces/cursor-paginated.interface.js';
import type { ProductCommentWithWriter } from './product-comments.select.js';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CreateProductCommentDto } from './dto/create-product-comment.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';

@Controller()
export class ProductCommentsController {
  constructor(
    private readonly productCommentsService: ProductCommentsService,
  ) {}

  @Get('products/:id/comments')
  @Public()
  findAll(
    @Param() { id }: IdParamDto,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginated<ProductCommentWithWriter>> {
    return this.productCommentsService.findAll(id, query);
  }

  @Post('products/:id/comments')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 10_000 } })
  create(
    @Param() { id }: IdParamDto,
    @Body() createProductCommentDto: CreateProductCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductCommentWithWriter> {
    return this.productCommentsService.create(
      id,
      createProductCommentDto,
      user.id,
    );
  }
}
