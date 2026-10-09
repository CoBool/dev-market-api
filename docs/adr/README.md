# 아키텍처 결정 기록 (ADR)

이 폴더는 이 프로젝트에서 내린 **설계 결정과 그 이유**를 기록합니다.
코드는 "무엇을 하는지"를 보여 주지만, "왜 이렇게 했는지"는 보여 주지 않기 때문입니다.

## 규칙

- 결정 하나당 파일 하나: `NNNN-짧은-제목.md`
- 결정이 바뀌면 기존 파일을 **고치지 않고** 새 ADR을 쓴 뒤, 기존 파일의 상태를 `대체됨 (NNNN)`으로 바꿉니다.
- 코드에는 긴 설명 대신 `docs/adr/NNNN 참고` 정도의 짧은 주석만 남깁니다.

## 상태

| 상태 | 뜻 |
|---|---|
| 제안됨 | 논의 중 |
| 승인됨 | 적용 중 |
| 보류 | 결정을 의도적으로 미룸 (조건이 생기면 다시 결정) |
| 대체됨 (NNNN) | 다른 ADR로 바뀜 |

## 목록

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-offset-pagination-for-articles.md) | 게시글 목록은 offset 페이지네이션 | 승인됨 |
| [0002](0002-page-has-no-upper-limit.md) | `page`에는 상한을 두지 않는다 | 승인됨 |
| [0003](0003-default-deny-authentication.md) | 인증은 전역 Guard + `@Public()` (기본 거부) | 승인됨 |
| [0004](0004-prisma-error-mapping-and-logging.md) | Prisma 에러: 4xx는 조용히, 5xx는 반드시 기록 | 승인됨 |
| [0005](0005-input-normalization-and-format-validation.md) | 입력값 정규화와 형식 검증 | 승인됨 |
| [0006](0006-separate-comment-tables-per-parent.md) | 댓글은 부모 종류마다 테이블을 나눈다 | 승인됨 |
| [0007](0007-anonymize-users-on-withdrawal.md) | 회원 탈퇴는 삭제가 아니라 익명화 | 승인됨 |
| [0008](0008-comment-cursor-pagination-and-routes.md) | 댓글 목록은 cursor, 오래된순 / 경로 설계 | 승인됨 |
| [0009](0009-defer-article-content-max-length.md) | 게시글 본문 최대 길이는 에디터 도입 시 정한다 | 보류 |
| [0010](0010-rate-limiting-policy.md) | 요청 제한 정책 | 승인됨 |
| [0011](0011-nickname-policy.md) | 닉네임 정책 | 승인됨 |

## 템플릿

```markdown
# NNNN. 제목

- 상태: 제안됨 | 승인됨 | 보류 | 대체됨 (NNNN)
- 날짜: YYYY-MM-DD

## 배경
어떤 문제 때문에 결정이 필요했나.

## 결정
무엇으로 정했나 (한두 문장).

## 근거
왜 그렇게 정했나. 검토한 대안과 버린 이유.

## 결과
이 결정으로 생기는 영향, 나중에 다시 볼 조건.
```
