import { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import type { PageMeta } from '../interfaces/paginated.interface.js';

export function getSkipTake(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  const { page, limit } = query;

  // 여기가 offset 을 터뜨리지 않게 하는 유일한 지점이다.
  //
  // page 는 상한이 없다 — 위치를 가리키는 힌트이므로 아무리 커도 "빈 목록"이 정답이기 때문이라,
  // 그 값이 그대로 (page - 1) * limit 계산에 들어가면 위험하다. JavaScript number 는 float64 이라
  // 이 곱이 MAX_SAFE_INTEGER 를 넘으면 정밀도가 깨지고, 더 커지면 PrismaClientValidationError 가 된다.
  // 그 예외는 PrismaClientKnownRequestError 의 형제라 예외 필터가 잡지 못해 500 이 된다.
  //
  // MAX_SAFE_INTEGER 로 잘라내면 어떤 page 가 들어와도 Prisma 가 받아들일 수 있는 offset 이 되고,
  // 요청은 "마지막 페이지보다 뒤" 라는 정직한 답(빈 목록)을 받는다.
  // page=999 나 page=1e308 은 모두 여기서 같은 길로 귀결된다 — 에러가 아니라 빈 목록.
  const skip = Math.min((page - 1) * limit, Number.MAX_SAFE_INTEGER);

  return { skip, take: limit };
}

export function buildPageMeta(
  query: PaginationQueryDto,
  totalCount: number,
): PageMeta {
  const { page, limit } = query;
  const totalPages = Math.ceil(totalCount / limit);

  return { page, limit, totalCount, totalPages };
}
