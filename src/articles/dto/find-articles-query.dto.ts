import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { Transform } from 'class-transformer';

const ARTICLE_SEARCH_TYPES = ['title', 'content', 'all'] as const;

export type ArticleSearchType = (typeof ARTICLE_SEARCH_TYPES)[number];

export class FindArticlesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @IsOptional()
  @IsIn(ARTICLE_SEARCH_TYPES)
  searchType: ArticleSearchType = 'all';
}
