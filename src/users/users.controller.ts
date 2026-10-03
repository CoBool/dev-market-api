import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { User } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthUser): Promise<Omit<User, 'passwordHash'>> {
    return this.usersService.findById(user.id);
  }
}
