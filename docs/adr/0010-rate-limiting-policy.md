# 0010. 요청 제한 정책

- 상태: 승인됨
- 날짜: 2026-10-08

## 배경
게시글을 연속으로 작성할 수 있었고, 로그인에 횟수 제한이 없어 비밀번호 대입 공격이 가능했다.

## 결정

| API | 기준 | 제한 |
|---|---|---|
| `POST /articles` | 사용자 id | 10초에 1회 |
| `POST /auth/sign-in` | IP | 1분에 5회 |
| `POST /auth/sign-up` | IP | 1분에 3회 |

- `@nestjs/throttler` + `UserThrottlerGuard`(`getTracker`: 로그인 사용자면 user id, 아니면 `req.ip`).
- 엔드포인트마다 `@UseGuards(UserThrottlerGuard)` + `@Throttle(...)`로 붙인다. 초과 시 429.

## 근거
- 같은 와이파이를 쓰는 사람들이 횟수를 나눠 쓰지 않도록, 로그인한 요청은 사용자 기준으로 센다.
- 로그인 전에는 누구인지 모르므로 IP가 유일한 기준이다.
- `X-Forwarded-For`를 직접 읽지 않는다. 클라이언트가 값을 바꿔 제한을 우회할 수 있다.
- Throttler는 API(라우트)마다 횟수를 따로 센다.

## 결과
- `ThrottlerModule.forRoot`의 기본값(1분 100회)은 Guard가 붙은 곳에만 의미가 있고, **공개 GET 목록에는 제한이 없다.**
- 배포 시 프록시 뒤라면 Express `trust proxy` 설정이 필요하다 (없으면 모든 요청이 프록시 IP로 묶인다).
- 429 메시지는 라이브러리 기본값(영어)이다.
- e2e: 인증·게시글 테스트는 `overrideGuard`로 끄고, `test/throttle.e2e-spec.ts`에서만 실제 동작을 검증한다.
