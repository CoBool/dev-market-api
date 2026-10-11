import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export async function createTestUser(
  app: INestApplication,
  userData: { email: string; nickname: string },
): Promise<{ id: number; accessToken: string }> {
  // 가입/로그인 요청 제한을 소비하지 않도록 DB에 직접 저장
  if (!/^[가-힣a-zA-Z0-9]{2,10}$/.test(userData.nickname)) {
    throw new Error('테스트 닉네임은 2~10자의 한글, 영문, 숫자여야 합니다.');
  }

  const prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: {
      email: userData.email,
      nickname: userData.nickname,
      passwordHash: 'test-password-hash',
    },
  });
  const jwtService = app.get(JwtService);
  const configService = app.get(ConfigService);
  const accessToken = await jwtService.signAsync(
    { sub: user.id },
    {
      secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    },
  );

  return { id: user.id, accessToken };
}
