import { Controller, Get, Post, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ArticlesService } from './articles.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';

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
}
