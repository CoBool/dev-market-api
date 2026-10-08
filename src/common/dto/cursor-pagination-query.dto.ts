import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max } from 'class-validator';
import { INT32_MAX } from '../constants/limits.js';
import { toPositiveInt } from '../transforms/to-positive-int.js';

export class CursorPaginationQueryDto {
  @IsOptional()
  @Transform(toPositiveInt)
  @IsInt()
  @Max(INT32_MAX)
  cursor?: number;

  @IsOptional()
  @Transform(toPositiveInt)
  @IsInt()
  @Max(100)
  limit: number = 10;
}
