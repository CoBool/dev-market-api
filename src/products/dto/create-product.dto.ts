import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.js';
import { normalizeTags } from '../transforms/normalize-tags.js';

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsInt()
  @Min(0)
  @Max(10_000_000)
  price: number;

  @Transform(normalizeTags)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 20, { each: true })
  tags: string[];
}
