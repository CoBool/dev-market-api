import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms/trim.js';

export class CreateArticleDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  title: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  content: string;
}
