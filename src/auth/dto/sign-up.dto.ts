import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, Length } from 'class-validator';
import { normalizeEmail } from '../../common/transforms/normalize-email.js';
import { trim } from '../../common/transforms/trim.js';
export class SignUpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @Length(1, 254)
  email: string;

  @Transform(trim)
  @IsString()
  @Length(2, 10)
  @Matches(/^[가-힣a-zA-Z0-9]+$/)
  nickname: string;

  @IsString()
  @Length(8, 72)
  @Matches(/^[a-zA-Z0-9!@#$%^&*]+$/)
  password: string;
}
