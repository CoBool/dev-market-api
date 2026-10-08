# 0006. 댓글은 부모 종류마다 테이블을 나눈다

- 상태: 승인됨
- 날짜: 2026-10-08

## 배경
게시글 댓글을 만들고, 나중에 상품 댓글도 만든다. 원본은 하나의 `Comment` 테이블에
`articleId?`, `productId?`를 둘 다 null 가능하게 두었다.

## 결정
- 부모 종류마다 테이블을 나눈다: `ArticleComment`(지금), `ProductComment`(상품 기능 때).
- `ArticleComment.articleId`는 **필수**, 외래 키 `ON DELETE CASCADE`.
- 인덱스: `(articleId, id)` 복합, `writerId`.
- 내용은 `VarChar(500)`.
- 코드도 부모 아래에 둔다: `src/articles/article-comments/` (`ArticleCommentsModule`은 `ArticlesModule`이 import).

## 근거
- "댓글은 반드시 존재하는 부모에 달린다"를 **코드가 아니라 DB가** 보장한다.
  원본 방식은 부모가 둘 다 null이거나 둘 다 채워진 댓글이 가능하다.
- 다형성(`targetType` + `targetId`)은 외래 키를 걸 수 없다.
  GitLab DB 개발 가이드: "always use separate tables instead of polymorphic associations".
  GitLab의 `Note` 모델은 다형성이지만 해당 줄에 `rubocop:disable Cop/PolymorphicAssociations`가 있다.
- Ghost·Lemmy도 댓글 테이블에 `post_id NOT NULL` + CASCADE를 쓴다.
- 복합 인덱스: 목록 쿼리가 `WHERE articleId = ? ORDER BY id`라 정렬 없이 필요한 만큼만 읽는다.
  Ghost도 `['post_id', 'parent_id', 'pinned_at']`처럼 부모 id로 시작하는 복합 인덱스를 쓴다.

## 결과
- 상품 댓글이 생기면 서비스·컨트롤러가 두 벌이 된다. 실제로 중복되기 시작하면 공통 로직을 뺀다
  (처음부터 추상 클래스를 만들지 않는다).
- **테이블 분리 기준은 "부모 테이블이 다른가"**다. 게시판 분류(자유·질문·공지)는 테이블이 아니라
  `Article.boardId` 같은 컬럼으로 구분한다.
- 대댓글(`parentId`), soft delete는 필요해질 때 추가한다.
