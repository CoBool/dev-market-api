# 0001. 게시글 목록은 offset 페이지네이션

- 상태: 승인됨
- 날짜: 2026-10-03

## 배경
`GET /articles`가 게시글 전체를 한 번에 반환했다. 목록을 나눠서 줄 방식이 필요했다.

## 결정
- `page`(기본 1, 1 이상 정수)와 `limit`(기본 10, 1~50 정수)를 받는 **offset** 방식을 쓴다.
- 응답은 배열이 아니라 객체로 감싼다.

```json
{ "items": [ ... ], "meta": { "page": 1, "limit": 10, "totalCount": 57, "totalPages": 6 } }
```

- 정렬은 `id` 내림차순(최신순).
- `PaginationQueryDto`, `getSkipTake`, `buildPageMeta`는 `src/common`에 두고 다른 목록에서도 재사용한다.

## 근거
- 게시판은 **페이지 번호 UI**가 일반적이다.
- cursor 방식(`?cursor=…`)은 새 글이 추가되어도 중복이 없고 깊은 페이지가 빠르지만, 임의 페이지로 이동할 수 없다.
- 두 방식을 한 엔드포인트에서 동시에 지원하는 안도 검토했으나, 쓰는 클라이언트가 없어 보류했다 (YAGNI).
- 응답을 `{ items, meta }`로 감싸 두면 나중에 `meta.nextCursor`를 **기존 클라이언트를 깨지 않고** 추가할 수 있다.

## 결과
- 새 글이 추가되는 동안 페이지를 넘기면 글이 중복되어 보일 수 있다 (offset의 한계).
- 댓글처럼 "더 보기" UI가 맞는 목록은 cursor를 쓴다 → [0008](0008-comment-cursor-pagination-and-routes.md)
