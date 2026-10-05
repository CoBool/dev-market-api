import { getSkipTake } from './pagination.js';

/**
 * offset 이 터지지 않는다는 것은 유틸의 책임이다. page 에 상한이 없으므로
 * (PaginationQueryDto 참조) 어떤 값이 들어와도 skip 은 Prisma 가 받아들일 수 있어야 한다.
 *
 * 이건 HTTP 로 도달 가능하므로 e2e 로도 잡히지만, 유틸 단위로 고정하면
 * "page 상한이 생기면 이 클램프를 지워도 되는가" 라는 질문에 답이 생긴다. 답은 지우면 안 된다.
 */
describe('getSkipTake', () => {
  it('정상 범위 -> page/limit 그대로 계산', () => {
    expect(getSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('page 1 -> skip 0', () => {
    expect(getSkipTake({ page: 1, limit: 10 })).toEqual({ skip: 0, take: 10 });
  });

  it.each([
    ['1e308', 1e308],
    ['Number.MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER],
    // int64 최댓값보다 큰 값. 2의 거듭제곱이라 float64 에 정확히 표현된다.
    ['2 ** 63', 2 ** 63],
  ])('page=%s -> skip 이 정수 안전 범위를 넘지 않는다', (_name, page) => {
    const { skip } = getSkipTake({ page, limit: 50 });

    expect(Number.isSafeInteger(skip)).toBe(true);
    expect(skip).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('클램프된 경우에도 take(=limit)는 그대로다 — 페이지 크기가 조용히 바뀌면 안 된다', () => {
    expect(getSkipTake({ page: 1e308, limit: 50 })).toEqual({
      skip: Number.MAX_SAFE_INTEGER,
      take: 50,
    });
  });
});
