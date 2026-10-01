import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, HttpCode } from '@nestjs/common';
import { ArticlesService } from './articles.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';

import type { Article } from './interfaces/article.interface.js';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(): Article[] {
    return this.articlesService.findAll();
  }
  
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id:number): Article {
    return this.articlesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateArticleDto): Article {
    return this.articlesService.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateArticleDto): Article {
    return this.articlesService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): void {
    this.articlesService.remove(id);
  }
}
