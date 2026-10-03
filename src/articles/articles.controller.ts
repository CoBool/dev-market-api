import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';

import type { Article } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(): Promise<Article[]> {
    return this.articlesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Article> {
    return this.articlesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() body: CreateArticleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Article> {
    return this.articlesService.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateArticleDto,
  ): Promise<Article> {
    return this.articlesService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.articlesService.remove(id);
  }
}
