# 0003. 인증은 전역 Guard + `@Public()` (기본 거부)

- 상태: 승인됨
- 날짜: 2026-10-05

## 배경
인증이 필요한 API마다 `@UseGuards(JwtAuthGuard)`를 붙였다.
새 API에서 이를 빠뜨려도 컴파일과 테스트가 모두 통과해, **조용한 인가 누락**이 생길 수 있었다.

## 결정
- `JwtAuthGuard`를 `AuthModule`에서 `APP_GUARD`로 **전역 등록**한다.
- 공개 API에만 `@Public()`을 붙인다 (`SetMetadata` + Guard에서 `Reflector`로 확인).
- 공개: `AuthController` 전체, `AppController` 전체, `GET /articles`, `GET /articles/:id`.

## 근거
- 실수했을 때의 결과가 "보안 구멍"이 아니라 "401"이 된다.
- 다른 모듈이 Guard 때문에 `AuthModule`을 import할 필요가 없어졌다.

## 결과
- 전역 Guard는 메서드 Guard보다 **먼저** 실행된다.
  그래서 `UserThrottlerGuard`는 항상 `request.user`가 채워진 뒤 실행된다 (throttle e2e로 고정).
- `@Public()` API에서 `@CurrentUser()`를 쓰면 `undefined`가 된다. 공개 API에서는 쓰지 않는다.
- Guard는 토큰 서명만 확인하고 사용자 존재는 확인하지 않는다. → [0007](0007-anonymize-users-on-withdrawal.md)
