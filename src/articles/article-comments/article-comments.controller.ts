import { Body, Controller, Param, Post } from '@nestjs/common';
import { ArticleCommentsService } from './article-comments.service.js';
import { IdParamDto } from '../../common/dto/id-param.dto.js';
import { CreateArticleCommentDto } from './dto/create-article-comment.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { ArticleCommentWithWriter } from './article-comments.select.js';

@Controller()
export class ArticleCommentsController {
  constructor(private readonly articleCommentService: ArticleCommentsService) {}

  @Post('articles/:id/comments')
  create(
    @Param() { id }: IdParamDto,
    @Body() createArticleCommentDto: CreateArticleCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleCommentWithWriter> {
    return this.articleCommentService.create(
      id,
      createArticleCommentDto,
      user.id,
    );
  }
}
