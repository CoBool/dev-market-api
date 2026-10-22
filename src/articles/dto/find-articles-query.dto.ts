import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { Transform } from 'class-transformer';
import { trim } from '../../common/transforms/trim.js';

const ARTICLE_SEARCH_TYPES = ['title', 'content', 'all'] as const;
const ARTICLE_ORDER_BYS = ['recent', 'like'] as const;

export type ArticleSearchType = (typeof ARTICLE_SEARCH_TYPES)[number];
export type ArticleOrderBy = (typeof ARTICLE_ORDER_BYS)[number];

export class FindArticlesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @IsOptional()
  @IsIn(ARTICLE_SEARCH_TYPES)
  searchType: ArticleSearchType = 'all';

  @IsOptional()
  @IsIn(ARTICLE_ORDER_BYS)
  orderBy: ArticleOrderBy = 'recent';
}
