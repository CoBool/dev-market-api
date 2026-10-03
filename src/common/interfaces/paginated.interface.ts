export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface PageMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}
