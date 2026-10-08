export interface CursorPageMeta {
  nextCursor: number | null;
}

export interface CursorPaginated<T> {
  items: T[];
  meta: CursorPageMeta;
}
