import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SignUpDto } from './dto/sign-up.dto.js';

import { hash } from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signUp(signUpDto: SignUpDto) {
    const { email, nickname, password } = signUpDto;

    const passwordHash = await hash(password, 10);

    return this.prisma.user.create({
      data: { email, nickname, passwordHash },
      omit: { passwordHash: true },
    });
  }
}
