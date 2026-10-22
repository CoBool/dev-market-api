# AGENTS.md

AI 코딩 에이전트(Codex, Claude Code, Gemini CLI 등)가 이 저장소에서 작업할 때 따르는 기준입니다.
규칙의 출처를 구분합니다: **[코드]** 저장소에서 확인한 구현 패턴, **[ADR]** `docs/adr/`의 결정, **[원칙]** 사용자가 정한 개발 원칙.

## Project Overview

- `dev-market-api`: 판다마켓 API를 NestJS로 옮기면서 백엔드를 학습하는 REST API 프로젝트. 학습이 주목적입니다.
- 스택 [코드]: Node.js >= 24 (`.node-version` 24), pnpm, TypeScript 6 (`strict`, `noUncheckedIndexedAccess`), NestJS 12,
  Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`), PostgreSQL 17 (`compose.yaml`), `@nestjs/jwt` + `bcryptjs`,
  `@nestjs/throttler`, class-validator / class-transformer, Vitest 4 + supertest, oxlint, Prettier.
- ESM 프로젝트(`"type": "module"`, `module: nodenext`)라서 상대 경로 import에는 **`.js` 확장자를 붙입니다** (`'./products.service.js'`).
- Prisma Client는 `src/generated/prisma`에 생성되고 git에서 제외됩니다. import는 `../generated/prisma/client.js`에서 합니다.
- 환경변수: `.env`(개발), `.env.test`(테스트). 키 목록은 `.env.example`(`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)을 보세요. `.env*` 값은 출력하지 않습니다.

## Reference Project

- 원본: https://github.com/codeit-bootcamp-frontend/FE-Sprint_Mission, **`main` 브랜치** (비공개). Express + tsoa + inversify + Prisma 5 기반입니다.
  접근 가능 여부는 실행 환경마다 다릅니다(인증된 `gh` 등). 접근할 수 없으면 내용을 추측하지 말고 "미검증"으로 보고합니다.
- 참고 범위 [ADR 0012]: **기능 범위는 원본을 따르고, 품질과 API 형태는 이 프로젝트가 정합니다.**
  - 원본과 경로(`/auth/sign-up`, `/article-comments/:id`), 쿼리(`limit`), 응답(`{ items, meta }`, 삭제 204), 에러 형태가 다른 것은 **의도한 차이**입니다. 원본에 맞추지 마세요.
  - 원본에 있지만 아직 없는 기능(이미지 업로드, 프로필 수정·비밀번호 변경·내 상품 목록 같은 사용자 API 등. `GET /users/me`는 구현됨)을 요청 없이 추가하지 마세요.
  - 원본에 없는 기능(예: 상품 가격순 정렬)도 요청 없이 추가하지 않습니다.
  - 원본의 구현 방식(Repository 계층, 같은 secret의 토큰, 작성자 삭제 시 Cascade 등)을 정답으로 가정하지 마세요.
- 원본은 요구사항, 비즈니스 규칙, 예외 상황을 확인하는 용도로 읽습니다.

## Architecture

- 도메인 모듈 [코드]: `auth`, `users`, `articles`(하위 `articles/article-comments`), `products`(하위 `products/product-comments`, `products/product-favorites`). 기본은 `Module` / `Controller` / `Service`이고, `dto/`, `<domain>.select.ts`는 필요한 도메인에만 있습니다(예: `users`는 `dto/`가 없고 Service에서 인라인 `omit`을 씁니다). 필요 없는 파일이나 계층을 형식적으로 만들지 않습니다.
- 공통 코드는 `src/common/` (`dto`, `transforms`, `utils`, `filters`, `guards`, `interfaces`, `constants`).
- `PrismaModule`은 전역 모듈이 아니어서 **각 도메인 모듈이 `imports: [PrismaModule]`** 합니다. Service가 `PrismaService`를 생성자 주입받아 직접 쿼리합니다(별도 Repository 계층 없음).
- Controller: 라우팅, DTO 바인딩, `@CurrentUser()`, `@Public()`, `@OptionalAuth()`, 요청 제한 데코레이터. 로직은 Service에 둡니다.
  - 컨트롤러의 모든 경로가 같은 접두사를 쓰면 `@Controller('products/:id/favorite')`처럼 접두사에 둡니다. 댓글처럼 접두사가 다른 경로가 섞이면(`articles/:id/comments` + `article-comments/:id`) `@Controller()`로 비우고 핸들러에 전체 경로를 씁니다.
- 전역 설정 (`src/app.module.ts`):
  - `APP_PIPE`: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
  - `APP_FILTER`: `PrismaExceptionFilter` (P2002/P2003 → 409, P2025 → 404, 그 외 → 500 + `Logger`) [ADR 0004]
  - `APP_GUARD`: `JwtAuthGuard` (`AuthModule`에서 등록). **기본 거부**이며 공개 API만 `@Public()`을 붙입니다 [ADR 0003].
    Guard는 서명만 검증하고 `request.user = { id }`를 채웁니다. `@Public()` API에서는 `@CurrentUser()`를 쓰지 않습니다.
  - `@OptionalAuth()` [ADR 0018]: `Authorization` 헤더가 없으면 비회원으로 통과(`user` 없음), 헤더가 있는데 잘못되면 401입니다.
    핸들러는 `@CurrentUser() user?: AuthUser`로 받고 `user?.id`를 Service에 넘깁니다. 지금은 `GET /articles/:id`(`isLiked`)만 씁니다.
    `@Public()`과 함께 붙이면 Guard가 에러를 던집니다.
- 요청 제한 [ADR 0010]: `ThrottlerGuard`는 전역이 아닙니다. 필요한 핸들러에만 `@UseGuards(UserThrottlerGuard)` + `@Throttle(...)`을 붙입니다(로그인 사용자는 user id, 그 외는 IP 기준).

## Coding Conventions

반복해서 확인된 패턴입니다. 새 코드는 같은 도메인 또는 가장 비슷한 도메인의 기존 코드를 먼저 보고 맞추세요.

- **DTO** [코드, ADR 0005]
  - 정규화와 검증은 필드별 API 계약을 따르고, 같은 도메인 DTO의 기존 규칙을 먼저 확인합니다. 한 DTO의 구현을 모든 DTO의 공통 규칙으로 넓히지 않습니다.
    - 제목·본문·댓글·이름·닉네임·검색어 같은 일반 텍스트: `@Transform(trim)` → `@IsString()` → `@IsNotEmpty()` / `@MaxLength()` 등. `@IsString()`을 빼지 않습니다.
    - 정해진 값 중 하나를 고르는 쿼리(`searchType`, `orderBy`): DTO에 `as const` 배열(`XXX_ORDER_BYS`)과 타입을 두고 `@IsOptional()` + `@IsIn(...)` + 필드 기본값을 씁니다.
    - 이메일: `normalizeEmail`(trim + 소문자). 비밀번호와 토큰은 trim하거나 정규화하지 않습니다.
  - 정규화 함수는 `({ value }) => ...` 형태의 순수 함수입니다. 여러 도메인에서 쓰면 `src/common/transforms/`, 한 도메인 전용이면 도메인 폴더(`products/transforms/normalize-tags.ts`)에 둡니다.
  - 경로 id는 `IdParamDto`, cursor 쿼리는 `CursorPaginationQueryDto`, offset 목록은 `PaginationQueryDto`를 상속합니다.
  - `@Type(() => Number)`는 값이 모두 문자열로 들어오는 **쿼리스트링에만** 씁니다. JSON 본문의 숫자 필드에 쓰면 `""`가 `0`, `true`가 `1`로 바뀌어 검증을 통과하므로, 본문은 변환 없이 `@IsInt()` 등으로 검사합니다 [ADR 0013].
  - 수정 계약은 도메인마다 다릅니다. 게시글·상품의 부분 수정 DTO는 `PartialType(CreateXxxDto, { skipNullProperties: false })`이고, 빈 body는 Service에서 400(`수정할 내용이 없습니다.`)으로 처리합니다. 댓글 수정 DTO(`UpdateArticleCommentDto`, `UpdateProductCommentDto`)는 작성 DTO를 그대로 상속해서 `content`가 필수입니다.
- **Prisma 쿼리** [코드, ADR 0015]
  - 응답 모양은 `<domain>.select.ts`에 `satisfies Prisma.XxxDefaultArgs`로 정의하고 `Prisma.XxxGetPayload<typeof args>`로 타입을 만듭니다.
  - 상세/등록/수정 응답은 `include` + `omit`(외래 키 제외), 작성자/판매자는 `{ id, nickname }`만 노출합니다. 상품 목록은 `select` 화이트리스트입니다.
  - 비밀번호 해시 등 민감 필드는 `omit`으로 빼고, 관계를 통째로 `include`하지 않습니다.
  - `...productArgs`처럼 펼친 뒤 같은 키(`omit`, `include`, `select`)를 다시 적으면 **합쳐지지 않고 덮어씁니다** (예: `omit`을 다시 적으면 `sellerId`가 응답에 다시 나옴). 합치려면 `omit: { ...productArgs.omit, ... }`처럼 안쪽까지 펼치거나, 용도별 객체를 `select.ts`에 따로 정의합니다.
  - 반환 타입은 "최소한 이 필드는 있다"만 보장하므로, 목록에 상세용 args를 잘못 써서 필드가 **더 많아져도** 컴파일 에러가 나지 않습니다. 응답 모양은 E2E에서 키를 정확히 비교해 지킵니다.
  - LIKE 검색은 `escapeLike()` + `contains` + `mode: 'insensitive'`. trim 후 빈 검색어는 필터 없음(전체 목록)입니다.
- **페이지네이션** [ADR 0001, 0002, 0008]
  - offset 목록: `count` → `buildPageMeta` → 범위를 넘으면 빈 `items` → `getSkipTake` → `findMany`. 응답 `{ items, meta: { page, limit, totalCount, totalPages } }`.
  - offset 목록 정렬: Service 모듈 상단의 `XXX_ORDER_BY` 맵(`satisfies Record<XxxOrderBy, Prisma.XxxOrderByWithRelationInput[]>`)에서 고릅니다. 기본 `recent`는 `id` 내림차순, 카운터 정렬(`like`, `favorite`)은 카운터 내림차순 + 2차 `id` 내림차순이며 `(카운터, id)` 인덱스가 있습니다. 2차 정렬 `id`는 E2E로 완전히 증명되지 않으므로 빼지 않습니다.
  - cursor 목록(댓글): `take: limit + 1`, 응답 `{ items, meta: { nextCursor } }`. 게시글 댓글은 `id` 오름차순(`gt`), 상품 댓글은 `id` 내림차순(`lt`)입니다.
- **권한** [코드]: 수정/삭제 전에 Service의 private `findOwnedXxx(id, userId, action)`으로 404 → 403 순서로 확인합니다. 하위 리소스는 `ensureXxxExists`로 부모 존재를 먼저 확인합니다.
- **에러**: Nest 내장 예외(`NotFoundException` 등)와 한국어 메시지를 씁니다. 상태 코드: 생성 201, 삭제 204(`@HttpCode(204)`), 로그인/refresh 200.
  좋아요 취소·찜 취소 `DELETE`는 변경된 상태를 본문으로 돌려주므로 `@HttpCode(200)`입니다.
- **좋아요·찜 카운터** [코드, ADR 0017, 0018]: 두 도메인의 API 모양은 비교를 위해 일부러 다릅니다(게시글: `POST`/`DELETE` + 중복 409 + 상세의 `isLiked`, 상품: 멱등 `PUT`/`DELETE` + 별도 `GET`). 통일 여부는 0018 회고에서 정하므로 한쪽에 맞추지 마세요. 쓰기 순서는 같습니다.
  1. `$transaction` 안에서 부모 행을 `SELECT ... FOR UPDATE`로 먼저 잠급니다(없으면 404). 부모 삭제의 Cascade와 잠금 순서를 맞춰 데드락을 막습니다.
  2. 조인 행을 만들거나 지우고, **실제로 바뀐 경우에만** 카운터를 `increment`/`decrement`합니다. 다시 세지(`_count`) 않습니다.
  3. 카운터 갱신 때 잠근 행의 `updatedAt`을 그대로 다시 넣어 `@updatedAt`이 바뀌지 않게 합니다.
- **DB**: 길이 제한은 DTO와 `@db.VarChar(n)`를 맞추고, 범위·개수 제약은 마이그레이션 SQL의 CHECK로 이중 검증합니다 [ADR 0013]. 작성자 관계는 Restrict(탈퇴는 익명화 예정) [ADR 0007], 댓글 → 부모는 Cascade. 좋아요·찜 조인 테이블은 복합 PK `(userId, 부모Id)`, 부모와 사용자 양쪽 Cascade이고, 카운터는 `CHECK (>= 0)`입니다.
- 포맷: Prettier(`singleQuote`, `trailingComma: all`). 코드 주석은 한국어이며 "왜"를 설명할 때만 씁니다.

## Development Principles [원칙]

- **YAGNI**: 현재 요청에 없는 기능, 옵션, 확장 지점을 만들지 않습니다. 보류된 결정(ADR 상태 `보류`)을 임의로 구현하지 않습니다.
- **섣부른 추상화 금지**: 코드가 비슷하다는 이유만으로 공통화하지 않습니다. 예를 들어 `findOwnedProduct`/`findOwnedArticle`은 도메인별로 따로 있습니다. 공통화를 제안할 때는 책임이 같은지, 같이 바뀌는지를 근거로 설명하세요.
- **도메인 책임**: 비즈니스 규칙과 권한은 해당 도메인 Service에 둡니다. DB 문법(LIKE escape 등) 처리는 DB 바로 앞(Service)에서 합니다.
- **기존 계약 유지**: 엔드포인트, 요청/응답 형태, 인증·권한 정책, 스키마, 비즈니스 규칙은 요청 없이 바꾸지 않습니다. 바꿔야 하면 이유와 영향을 먼저 설명합니다.
- **근거 기반**: 일반적인 Best Practice라는 이유만으로 기존 구현을 바꾸자고 하지 않습니다. 코드, 테스트, ADR을 근거로 이 프로젝트에서의 장단점을 제시합니다.
- 설계 결정의 이유는 `docs/adr/`(목록: `docs/adr/README.md`)에 있습니다. **`docs/`와 `review/`는 `.git/info/exclude`로 제외된 로컬 전용 문서**라 clone에는 없을 수 있습니다. 없으면 코드와 테스트를 기준으로 판단하세요.

## Testing & Verification

| 목적 | 명령어 |
|---|---|
| 단위 테스트 (`src/**/*.spec.ts`) | `pnpm test` |
| E2E 테스트 (`test/**/*.e2e-spec.ts`, 아래 DB 안전 확인 후) | `pnpm test:e2e` |
| E2E 단일 파일 | `pnpm test:e2e test/products/create.e2e-spec.ts` |
| 린트 | `pnpm lint` (`oxlint --type-aware src/ test/`) |
| 포맷 | `pnpm format` (파일을 수정함) |
| 빌드 | `pnpm build` |
| 타입 검사 (스크립트 없음) | `pnpm exec tsc --noEmit` |

- **E2E는 DB를 변경합니다.** `test/global-setup.ts`가 `.env.test`의 `DATABASE_URL`에 `prisma migrate deploy`를 실행하고, 테스트가 데이터를 만들고 지웁니다. 파일은 순차 실행됩니다(`fileParallelism: false`).
  - 실행 전에 테스트 DB(`compose.yaml`의 `postgres-test`, `127.0.0.1:5433`, tmpfs) 컨테이너가 실행 중인지, `.env.test`의 실제 연결 대상(호스트·포트·DB 이름)이 그 폐기 가능한 DB인지 확인합니다. global-setup의 `_test` 문자열 검사만으로 안전하다고 판단하지 않습니다.
  - 비밀 값이나 전체 연결 문자열은 출력하지 않습니다(필요하면 비밀번호를 가려서 호스트·포트·DB 이름만 확인).
  - 연결 대상의 안전성을 확인할 수 없거나 테스트 DB 작업이 승인 범위에 있는지 불명확하면 실행하지 않습니다. 컨테이너가 꺼져 있으면 원인을 보고하고, 승인 없이 서비스를 시작하거나 환경을 바꾸지 않습니다. 실행하지 못한 검증은 이유와 함께 보고합니다.
- E2E 파일은 대부분 `AppModule`로 앱을 띄우고 `resetDatabase()`(`test/helpers/db.ts`)로 FK 역순 삭제합니다(`app.e2e-spec.ts`는 DB를 정리하지 않음). **모델을 추가하면 이 삭제 순서도 갱신**해야 합니다.
- 테스트 사용자는 `createTestUser()`(`test/helpers/users.ts`)로 DB에 직접 만들고 토큰을 발급합니다(가입 요청 제한을 소비하지 않음).
- **동시 요청 테스트**(`Promise.all`로 같은 앱에 여러 요청)가 있는 파일은 `beforeAll`에서 `app.init()` 뒤에 `await app.listen(0)`을 호출합니다.
  서버가 열려 있지 않으면 supertest가 요청마다 서버를 열고 닫아, 먼저 끝난 요청이 서버를 닫으면서 다른 요청이 `ECONNRESET`으로 실패합니다(`favorite.e2e-spec.ts`, `articles.e2e-spec.ts` 참고).
- 파일 구성은 도메인마다 다릅니다: 상품은 API별 파일(`test/products/*.e2e-spec.ts`), 게시글·댓글·인증·요청 제한은 도메인별 통합 파일(`test/articles.e2e-spec.ts` 등). 새 테스트는 해당 도메인의 기존 구성을 따릅니다. 응답 키를 정확히 비교하고, 실패 시 DB가 바뀌지 않았는지도 확인하는 패턴이 있습니다.
- `schema.prisma`를 바꾸면 `pnpm exec prisma generate`가 필요합니다(Prisma 7은 `migrate dev` 후 자동 생성하지 않음).
- 실행하지 못한 검증은 "실행하지 않음"으로 보고합니다. 테스트 통과 여부를 추측하지 않습니다.

## Agent Workflow

**구현 전**
1. `git status`와 관련 diff로 기존 사용자 변경을 확인합니다. 사용자 변경을 덮어쓰거나 되돌리지 않습니다.
2. 요청 범위를 확인하고, 관련 Controller/Service/DTO/select와 해당 E2E 파일, 관련 ADR을 먼저 읽습니다.
3. 같은 종류의 기존 구현(다른 도메인의 CRUD, 페이지네이션, 권한 확인)을 찾아 패턴을 맞춥니다.
4. 영향 범위(응답 모양, 스키마, 기존 테스트)를 정리합니다. 영향이 크거나 범위가 불분명한 작업은 계획을 먼저 제시하고 승인을 받습니다. 사용자가 승인한 범위 안에서는 수정 파일이 여러 개라는 이유만으로 다시 승인을 받지 않고, 필요한 구현과 관련 테스트 변경을 진행합니다.

**구현 중**
1. 요청 범위 안에서만 수정합니다. 요청하지 않은 리팩터링이나 정리를 섞지 않습니다.
2. 새 추상화나 의존성이 필요해 보이면 구현하지 말고 이유와 대안을 먼저 제안합니다.
3. 승인 범위 밖의 변경(API 계약, 스키마, 의존성, 위험한 DB 작업 등, 아래 Restrictions)은 별도 승인 전에 적용하지 않습니다.

**구현 후**
1. 변경 영향을 다시 검토하고 `pnpm lint`, 타입 검사, `pnpm test`를 실행합니다. 관련 `pnpm test:e2e`는 실행 대상과 승인 여부를 확인한 뒤 실행합니다(Testing & Verification의 DB 안전 확인).
2. 실패하면 원인을 분석합니다. 기존 테스트 실패가 승인된 동작 변경 때문인지 불명확하면 사용자에게 확인하기 전에는 기대값을 바꾸지 않습니다.
3. 변경 내용, 실행한 검증과 결과, 실행하지 못한 검증을 간결하게 보고합니다.

**사용자 작업 방식** [원칙]: 사용자는 NestJS를 단계별로 학습하며 직접 코드를 작성합니다. 명시적으로 코드 작성을 요청하지 않으면 리뷰와 설명을 우선합니다. 커밋 안내는 `git add .` 대신 파일 단위로 쓰고, 관련 없는 변경(포맷 등)은 별도 커밋으로 나눕니다. 공개 저장소이므로 로컬 전용인 `docs/`, `review/` 아래 파일은 `git add` 대상에 넣지 않습니다(`-f`로 강제 추가하지 않음). 커밋 메시지는 `feat:` / `fix:` / `test:` / `refactor:` / `chore:` + 한국어 요약 형식입니다 [코드: git log].

**리뷰**: 정확성, 보안(인가 누락, 민감 필드 노출), 데이터 일관성, 비즈니스 규칙, 기존 패턴과의 일관성, 불필요한 복잡성, 테스트 적절성을 봅니다. **실제 수정이 필요한 문제**와 **취향 차이**를 구분해서 보고합니다.

## Restrictions

다음 작업은 사용자의 명시적인 승인 없이 하지 않습니다. 읽기 전용 분석은 허용됩니다.

- 요청 범위를 벗어난 코드 변경, 대규모 리팩터링
- 의존성 추가, 제거, 업데이트 (`pnpm add`, lockfile 변경)
- `schema.prisma` 변경, 마이그레이션 생성
- 개발·테스트·운영·공유 DB의 데이터나 스키마를 바꾸는 작업: 마이그레이션 실행(`prisma migrate dev/deploy/reset`), seed, `prisma db push`, 직접 SQL 실행, E2E 실행 (`pnpm db:reset`은 개발 DB를 초기화합니다). 승인을 받았더라도 연결 대상을 먼저 확인합니다.
- 환경변수, 운영 설정, 인증·보안 정책(Guard, `@Public()`, 토큰, 요청 제한) 변경
- 외부 서비스에 영향을 주는 작업 (원본 저장소 포함 GitHub에 쓰기 등)
- Git commit, push, merge (사용자가 직접 커밋합니다)
- 기존 테스트 삭제, 테스트를 통과시키기 위한 임의의 검증 완화나 기대값 수정
- `docs/adr/`의 기존 결정을 덮어쓰기 (결정이 바뀌면 새 ADR을 쓰는 것이 ADR 규칙입니다)
