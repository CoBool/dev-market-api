import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ArticlesService } from './articles.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { Throttle } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';
import { FindArticlesQueryDto } from './dto/find-articles-query.dto.js';
import { IdParamDto } from '../common/dto/id-param.dto.js';
import type { ArticleWithWriter } from './articles.select.js';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(
    @Query() query: FindArticlesQueryDto,
  ): Promise<Paginated<ArticleWithWriter>> {
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param() { id }: IdParamDto): Promise<ArticleWithWriter> {
    return this.articlesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 10_000 } })
  create(
    @Body() createArticleDto: CreateArticleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleWithWriter> {
    return this.articlesService.create(createArticleDto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param() { id }: IdParamDto,
    @Body() updateArticleDto: UpdateArticleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleWithWriter> {
    return this.articlesService.update(id, updateArticleDto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  remove(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.articlesService.remove(id, user.id);
  }
}
