import { Injectable, NotFoundException } from '@nestjs/common';
import type { Article } from './interfaces/article.interface.js';
import { CreateArticleDto } from './dto/create-article.dto.js';

@Injectable()
export class ArticlesService {
  private nextId = 3;
  private articles: Article[] = [
    {
      id: 1,
      title: '안녕하세요',
      content: '반가워요',
      createdAt: new Date(),
    },
    {
      id: 2,
      title: '잘있어요',
      content: '다시만나요',
      createdAt: new Date(),
    },
  ]
  findAll(): Article[] {
    return this.articles;
  }

  findOne(id:number): Article {
    const article = this.articles.find((article) => article.id === id);
    
    if (!article) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    return article;
  }

  create(createArticleDto: CreateArticleDto): Article {
    const { title, content} = createArticleDto;
    const newArticle: Article = {
      id: this.nextId++,
      title,
      content,
      createdAt: new Date()
    };

    this.articles.push(newArticle);

    return newArticle;
  }
}
