import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SignUpDto } from './dto/sign-up.dto.js';

import type { User } from '../generated/prisma/client.js';
import { SignInDto } from './dto/sign-in.dto.js';
import type { AuthTokens } from './interfaces/auth-tokens.interface.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Public } from './decorators/public.decorator.js';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard.js';
import { Throttle } from '@nestjs/throttler';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-in')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signIn(@Body() body: SignInDto): Promise<AuthTokens> {
    return this.authService.signIn(body);
  }

  @Post('sign-up')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  signUp(@Body() body: SignUpDto): Promise<Omit<User, 'passwordHash'>> {
    return this.authService.signUp(body);
  }

  @Post('refresh')
  @HttpCode(200)
  refreshAccessToken(@Body() body: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refreshAccessToken(body);
  }
}
