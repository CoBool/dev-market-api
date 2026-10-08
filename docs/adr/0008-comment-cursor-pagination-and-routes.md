# 0008. 댓글 목록은 cursor, 오래된순 / 경로 설계

- 상태: 승인됨
- 날짜: 2026-10-08

## 배경
댓글 API의 페이지네이션, 정렬, 경로를 정해야 했다.

## 결정

### 경로
| 메서드 | 경로 | 인증 |
|---|---|---|
| POST | `/articles/:id/comments` | 필요 (없는 게시글이면 404) |
| GET | `/articles/:id/comments` | 공개 |
| PATCH | `/article-comments/:id` | 필요, 작성자만 |
| DELETE | `/article-comments/:id` | 필요, 작성자만 |

### 목록
- **cursor** 페이지네이션: `{ items, meta: { nextCursor } }` (`CursorPaginated<T>`, `common/interfaces`)
- **오래된순** (`id` 오름차순)
- 쿼리: `CursorPaginationQueryDto` (`common/dto`)
  - `cursor`: 선택. 양의 십진 정수, int32 범위 (`toPositiveInt`, [0005](0005-input-normalization-and-format-validation.md))
  - `limit`: 기본 10, **1~100** (게시글 목록은 1~50). 댓글은 짧아서 한 번에 더 가져와도 부담이 적다
- 조회: `where: { articleId, id: { gt: cursor } }`, `orderBy: { id: 'asc' }`, `take: limit + 1`
  - `limit + 1`개를 가져와 다음 페이지 존재를 판단한다 (count 쿼리 없음)
  - 다음이 있으면 `nextCursor` = 응답 마지막 댓글의 id, 없으면 `null`
- Prisma의 `cursor` 옵션 대신 `id > cursor` 조건을 쓴다. Prisma `cursor`는 그 행이 존재해야 하므로,
  클라이언트가 가진 cursor 댓글이 삭제되면 문제가 생긴다.
- `CursorPaginationQueryDto`는 `PaginationQueryDto`를 상속하지 않는다 (`page`가 딸려 오지 않도록).

### 내용
- trim + `@IsString()` + `@IsNotEmpty()` + `@MaxLength(500)`

## 근거
- 작성·목록은 "어느 게시글의 댓글인가"가 필요해 중첩 경로를 쓴다.
  수정·삭제는 댓글 id만으로 대상이 특정된다.
- `/comments/:id`가 아니라 `/article-comments/:id`: 테이블이 나뉘어([0006](0006-separate-comment-tables-per-parent.md))
  게시글 댓글과 상품 댓글의 id가 **각자 1부터** 시작한다. `/comments/5`는 나중에 모호해진다.
- 댓글은 "더 보기" UI가 일반적이고, 새 댓글이 달려도 cursor는 중복이 생기지 않는다.
  게시글 목록(offset, [0001](0001-offset-pagination-for-articles.md))과 다른 전략을 쓰는 것은 의도한 것이다.
- 게시판 댓글은 질문과 답이 위에서 아래로 이어지므로 오래된순이 자연스럽다.
  `(articleId, id)` 인덱스는 양방향 정렬 모두에 쓰인다.

## 결과
- 수정·삭제 권한 확인은 게시글과 같은 "조회 → 403" 방식이다. 서비스의 공통 private 메서드
  (`findOwnedComment`, 게시글은 `findOwnedArticle`)에서 조회 → 404 → 403을 한 번에 처리한다.
  권한 확인에는 `writerId`만 조회한다.
- 수정 DTO(`UpdateArticleCommentDto`)는 작성 DTO를 상속하며 `content`가 **필수**다.
  바꿀 수 있는 필드가 하나뿐이라, 게시글처럼 "빈 본문이면 400"을 따로 처리할 필요가 없다.
- 작성은 요청 제한이 있다 (10초에 3회) → [0010](0010-rate-limiting-policy.md)
  "작성자 조건으로 바로 수정 → 실패 시 404/403 구분"은 최적화로서 선택 사항이다.
