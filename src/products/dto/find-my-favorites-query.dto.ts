import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { toPositiveInt } from '../../common/transforms/to-positive-int.js';

export class FindMyFavoritesQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Transform(toPositiveInt)
  @IsInt()
  @Max(100)
  limit: number = 10;
}
