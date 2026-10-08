# 0002. `page`에는 상한을 두지 않는다

- 상태: 승인됨
- 날짜: 2026-10-04 (2026-10-08 보완)

## 배경
`?page=1e308`처럼 큰 값을 보내면 `skip = (page - 1) * limit`이 int64를 넘어
`PrismaClientValidationError`가 나고, 인증 없이 누구나 500을 만들 수 있었다.

## 결정
- `page`에는 **최대값을 두지 않는다.** 범위를 벗어나면 에러가 아니라 **200 + 빈 목록**을 준다.
- `getSkipTake`에서 `skip`을 `Number.MAX_SAFE_INTEGER`로 클램프해 500을 구조적으로 막는다.
- 목록 조회는 **count를 먼저** 하고, `page > totalPages`이면 `findMany`를 실행하지 않는다.
- 목록과 count를 `$transaction`으로 묶지 않는다.

## 근거
- `page`는 "어디쯤인가"를 가리키는 **위치 힌트**다. 존재하지 않는 위치에 대한 정직한 답은 "없다"(빈 목록)다.
- 상한(500)을 두는 안을 한때 적용했으나 되돌렸다.
  - 500은 스키마가 아니라 고른 숫자였다.
  - "마지막 페이지 뒤 → 빈 목록"과 "500 초과 → 400"이라는 두 가지 답이 생겼다.
  - `limit` 10이면 글 5,001개부터 `totalPages`(501)와 상한이 어긋났다.
- `skip` 상한: Prisma의 `skip`은 int64(로그로 확인), PostgreSQL `OFFSET`은 bigint다.
  `MAX_SAFE_INTEGER`(약 9.0e15)는 int64(약 9.2e18)보다 작아 안전하다.
- count 선행: 범위 밖 페이지가 깊은 OFFSET 조회로 이어지지 않는다.
  게시글 30만 건에서 측정한 결과, 범위 밖 페이지 38ms → 16ms, 결과 없는 검색 312ms → 86ms. 정상 요청은 차이 없음.
- `$transaction`: PostgreSQL 기본 격리 수준(READ COMMITTED)에서는 트랜잭션 안이라도 쿼리마다 새 시점을 본다.
  묶어도 일관성이 보장되지 않으며, 목록과 개수가 글 1개 정도 어긋나는 것은 게시판에서 허용한다.

## 결과
- 요청당 비용의 하한은 `count()`다. 검색(`ILIKE '%…%'`)은 인덱스를 쓰지 못해 30만 건에서 약 290ms.
- 데이터가 커지면 다음 순서로 검토한다: 공개 목록 요청 제한 → count 상한(`totalPages: null`) → cursor → `pg_trgm` 인덱스.
- 관련 테스트: `src/common/utils/pagination.spec.ts`, `test/articles.e2e-spec.ts`의 page 경계값 케이스.
