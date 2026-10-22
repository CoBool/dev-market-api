import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { Transform } from 'class-transformer';
import { trim } from '../../common/transforms/trim.js';

const PRODUCT_ORDER_BYS = ['recent', 'favorite'] as const;
export type ProductOrderBy = (typeof PRODUCT_ORDER_BYS)[number];

export class FindProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @IsOptional()
  @IsIn(PRODUCT_ORDER_BYS)
  orderBy: ProductOrderBy = 'recent';
}
