import { Transform } from 'class-transformer';
import { IsInt, Max } from 'class-validator';

// id 는 페이지 위치가 아니라 리소스를 특정하는 값이라 "이 값이어야 한다"가 성립한다.
// 범위는 스키마에서 온다 — prisma/schema.prisma 의 `id Int @id`, 즉 PostgreSQL integer(32비트).
// Prisma 는 64비트 경계까지만 검증하고 PostgreSQL 이 "out of range for the type integer" 로
// 거절하므로, 32비트 경계는 입구에서 직접 막아야 한다.
const INT32_MAX = 2_147_483_647;

export class IdParamDto {
  @Transform(({ value }) =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
  )
  @IsInt()
  @Max(INT32_MAX)
  id: number;
}
