import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SignUpDto } from './dto/sign-up.dto.js';

import type { User } from '../generated/prisma/client.js';
import { SignInDto } from './dto/sign-in.dto.js';
import type { AuthTokens } from './interfaces/auth-tokens.interface.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-in')
  @HttpCode(200)
  signIn(@Body() body: SignInDto): Promise<AuthTokens> {
    return this.authService.signIn(body);
  }

  @Post('sign-up')
  signUp(@Body() body: SignUpDto): Promise<Omit<User, 'passwordHash'>> {
    return this.authService.signUp(body);
  }
}
