import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ArticleLikesService,
  type ArticleLikeStatus,
} from './article-likes.service.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';

@Controller('articles/:id/like')
export class ArticleLikesController {
  constructor(private readonly articleLikesService: ArticleLikesService) {}

  @Get()
  findOne(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleLikeStatus> {
    return this.articleLikesService.findOne(id, user.id);
  }

  @Put()
  like(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleLikeStatus> {
    return this.articleLikesService.like(id, user.id);
  }

  @Delete()
  @HttpCode(200)
  unlike(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleLikeStatus> {
    return this.articleLikesService.unlike(id, user.id);
  }
}
