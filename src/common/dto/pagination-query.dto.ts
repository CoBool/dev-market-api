import { Type } from 'class-transformer';
import { IsOptional, Min, Max, IsInt } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // page 에는 상한을 두지 않는다. id 처럼 "이 값이어야 한다"는 뜻이 아니라 위치를
  // 가리키는 힌트라서, 범위를 벗어나면 에러가 아니라 빈 목록이 정답이다.
  // offset 이 터지는 문제는 getSkipTake 가 막는다.
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // limit 은 page 와 달리 상한이 필요하다. take 는 가공 없이 Prisma 로 직행하므로
  // (take=1e308 은 PrismaClientValidationError) 여기서 막는 수 밖이 없고,
  // 50 은 한 페이지 최대 크기라는 제품 결정이기도 하다.
  @Max(50)
  limit: number = 10;
}
