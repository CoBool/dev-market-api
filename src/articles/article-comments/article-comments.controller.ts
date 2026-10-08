import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ArticleCommentsService } from './article-comments.service.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { CreateArticleCommentDto } from './dto/create-article-comment.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { ArticleCommentWithWriter } from './article-comments.select.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto.js';
import type { CursorPaginated } from '../../common/interfaces/cursor-paginated.interface.js';

@Controller()
export class ArticleCommentsController {
  constructor(
    private readonly articleCommentsService: ArticleCommentsService,
  ) { }

  @Get('articles/:id/comments')
  @Public()
  findAll(
    @Param() { id }: IdParamDto,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginated<ArticleCommentWithWriter>> {
    return this.articleCommentsService.findAll(id, query);
  }

  @Post('articles/:id/comments')
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
}
