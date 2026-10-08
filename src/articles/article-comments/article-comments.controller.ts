import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArticleCommentsService } from './article-comments.service.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { CreateArticleCommentDto } from './dto/create-article-comment.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { ArticleCommentWithWriter } from './article-comments.select.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto.js';
import type { CursorPaginated } from '../../common/interfaces/cursor-paginated.interface.js';
import { UpdateArticleCommentDto } from './dto/update-article-comment.dto.js';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard.js';
import { Throttle } from '@nestjs/throttler';

@Controller()
export class ArticleCommentsController {
  constructor(
    private readonly articleCommentsService: ArticleCommentsService,
  ) {}

  @Get('articles/:id/comments')
  @Public()
  findAll(
    @Param() { id }: IdParamDto,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginated<ArticleCommentWithWriter>> {
    return this.articleCommentsService.findAll(id, query);
  }

  @Post('articles/:id/comments')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 10_000 } })
  create(
    @Param() { id }: IdParamDto,
    @Body() createArticleCommentDto: CreateArticleCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleCommentWithWriter> {
    return this.articleCommentsService.create(
      id,
      createArticleCommentDto,
      user.id,
    );
  }

  @Patch('article-comments/:id')
  update(
    @Param() { id }: IdParamDto,
    @Body() updateArticleCommentDto: UpdateArticleCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleCommentWithWriter> {
    return this.articleCommentsService.update(
      id,
      updateArticleCommentDto,
      user.id,
    );
  }

  @Delete('article-comments/:id')
  @HttpCode(204)
  remove(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.articleCommentsService.remove(id, user.id);
  }
}
