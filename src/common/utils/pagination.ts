import { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import type { PageMeta } from '../interfaces/paginated.interface.js';

export function getSkipTake(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

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
