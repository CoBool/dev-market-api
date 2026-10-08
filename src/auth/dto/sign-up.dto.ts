import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, Length } from 'class-validator';
import { normalizeEmail } from '../../common/transforms/normalize-email.js';
export class SignUpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @Length(1, 254)
  email: string;

  @IsString()
  @Length(1, 20)
  nickname: string;

  @IsString()
  @Length(8, 72)
  @Matches(/^[a-zA-Z0-9!@#$%^&*]+$/)
  password: string;
}
