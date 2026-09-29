import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ArticlesService } from './articles.service.js';

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
}
