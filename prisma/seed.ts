import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const PASSWORD = 'password1234';

// 앞 SELLER_COUNT명은 판매자, 나머지는 구매자 (마지막은 수동 테스트용 계정)
const SEED_USERS = [
  { email: 'frontend_sangmin@gmail.com', nickname: '코딩하는코기' },
  { email: 'dev.danielle@naver.com', nickname: '버그퇴치반' },
  { email: 'react_master99@kakao.com', nickname: '커밋장인' },
  { email: 'refactor.lover@gmail.com', nickname: '리팩토링중' },
  { email: 'type.script@naver.com', nickname: '타입스크립터' },
  { email: 'lint_fairy@kakao.com', nickname: '린터요정' },
  { email: 'deploy.god@gmail.com', nickname: '배포의신' },
  { email: 'night_coder@naver.com', nickname: '야근하는곰' },
  { email: 'query.master@kakao.com', nickname: '쿼리장인' },
  { email: 'docker_whale@gmail.com', nickname: '도커고래' },
  { email: 'git.branch@naver.com', nickname: '깃브랜치' },
  { email: 'test_king@kakao.com', nickname: '테스트왕' },
  { email: 'junior.front@gmail.com', nickname: '프론트신입' },
  { email: 'backend.dream@naver.com', nickname: '백엔드꿈나무' },
  { email: 'test@test.com', nickname: '테스트계정' },
];

// 15명 × 0.7 = 10.5 → 70%를 넘지 않도록 내림 (판매자 10, 구매자 5)
const SELLER_RATIO = 0.7;
const SELLER_COUNT = Math.floor(SEED_USERS.length * SELLER_RATIO);

const ARTICLE_TOPICS = [
  '개발 도구 구매 후기',
  'NestJS 보일러플레이트 질문',
  '코드 리뷰 요청',
  '라이선스 문의',
  '오늘의 개발 환경 공유',
];

const ARTICLE_COUNT = 25;
const FEATURED_COMMENT_COUNT = 18;

// 게시글 i의 좋아요 수. 같은 값을 여러 개 두어 좋아요순의 2차 정렬(id 내림차순)을 확인할 수 있게 한다.
// 한 글에 같은 사용자가 두 번 좋아요할 수 없으므로 최대값은 사용자 수(15)다.
const ARTICLE_LIKE_COUNTS = [
  0, 3, 1, 5, 3, 0, 8, 3, 2, 0, 12, 1, 4, 6, 0, 3, 9, 2, 7, 1, 0, 5, 10, 3, 15,
];

// 원형 10개 × 에디션 5개 = 상품 50개
const PRODUCT_TEMPLATES = [
  {
    name: 'NestJS 인증 보일러플레이트',
    price: 29_000,
    tags: ['nestjs', 'auth', 'boilerplate'],
    description:
      'JWT 로그인·토큰 갱신, 가드, DTO 검증이 갖춰진 NestJS 시작 템플릿입니다.',
  },
  {
    name: 'React 어드민 대시보드',
    price: 49_000,
    tags: ['react', 'admin', 'dashboard'],
    description:
      '표, 차트, 사이드바 레이아웃이 포함된 관리자 화면 템플릿입니다.',
  },
  {
    name: 'Prisma 스키마 모음',
    price: 15_000,
    tags: ['prisma', 'postgresql', 'schema'],
    description:
      '회원, 게시판, 주문 등 자주 쓰는 도메인의 Prisma 스키마 예제 모음입니다.',
  },
  {
    name: 'Docker Compose 개발환경',
    price: 9_000,
    tags: ['docker', 'devops'],
    description:
      'DB, 캐시, 앱을 한 번에 띄우는 로컬 개발용 compose 설정입니다.',
  },
  {
    name: 'oxlint 설정 팩',
    price: 5_000,
    tags: ['lint', 'oxlint', 'config'],
    description:
      'TypeScript 프로젝트에 바로 적용할 수 있는 린트 규칙 모음입니다.',
  },
  {
    name: 'GitHub Actions CI 템플릿',
    price: 12_000,
    tags: ['ci', 'github-actions'],
    description: '린트, 테스트, 빌드를 자동으로 돌리는 워크플로 템플릿입니다.',
  },
  {
    name: 'VS Code 스니펫 패키지',
    price: 7_000,
    tags: ['vscode', 'snippet'],
    description:
      'NestJS, React에서 자주 쓰는 코드 조각을 단축키로 입력하는 스니펫입니다.',
  },
  {
    name: 'REST API 테스트 스위트',
    price: 35_000,
    tags: ['test', 'e2e', 'vitest'],
    description: 'supertest 기반 e2e 테스트 구조와 DB 초기화 헬퍼 예제입니다.',
  },
  {
    name: 'Next.js 랜딩 UI 킷',
    price: 39_000,
    tags: ['nextjs', 'ui', 'landing'],
    description:
      '히어로, 가격표, FAQ 섹션을 조합해 쓰는 랜딩 페이지 컴포넌트 모음입니다.',
  },
  {
    name: 'CLI 도구 스캐폴딩',
    price: 19_000,
    tags: ['cli', 'node', 'scaffold'],
    description:
      'Node.js CLI 프로젝트의 명령어 구조와 빌드 설정을 갖춘 시작 코드입니다.',
  },
] as const;

const PRODUCT_EDITIONS = ['Lite', 'Starter', 'Pro', 'Team', 'Max'] as const;
const PRODUCT_COUNT = 50;

// 상품 i의 찜 수. 게시글 좋아요와 같은 이유로 같은 값을 여러 개 두고, 최대값은 사용자 수(15)다.
const PRODUCT_FAVORITE_COUNTS = [
  0, 2, 5, 1, 0, 7, 3, 0, 12, 2, 4, 0, 9, 1, 3, 0, 6, 15, 2, 0, 8, 3, 1, 0, 5,
  10, 0, 2, 4, 1, 0, 6, 3, 11, 0, 2, 7, 0, 1, 4, 3, 0, 13, 5, 2, 0, 9, 1, 3, 8,
];

// 같은 시드면 항상 같은 판매자 분배가 나오도록 고정
const RANDOM_SEED = 20261011;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL이 설정되지 않았습니다.');
}

if (databaseUrl.includes('_test')) {
  throw new Error('테스트 데이터베이스에서는 seed를 실행할 수 없습니다.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

function pick<T>(list: readonly T[], i: number): T {
  const item = list[i % list.length];
  if (item === undefined) throw new Error('빈 배열에서 고를 수 없습니다.');

  return item;
}

// createManyAndReturn은 반환 순서를 보장하지 않는다(Prisma 문서).
// 아래 코드는 입력 i번째와 결과 i번째를 같은 행으로 보고 연결하므로, 고유한 값으로 입력 순서를 되찾는다.
function inInputOrder<T, K>(
  rows: readonly T[],
  keys: readonly K[],
  keyOf: (row: T) => K,
): T[] {
  const rowsByKey = new Map(rows.map((row) => [keyOf(row), row]));
  if (rowsByKey.size !== keys.length) {
    throw new Error('입력 순서를 되찾을 값이 고유하지 않습니다.');
  }

  return keys.map((key) => {
    const row = rowsByKey.get(key);
    if (!row) throw new Error('생성 결과에서 입력 행을 찾을 수 없습니다.');

    return row;
  });
}

// mulberry32: 0 이상 1 미만의 재현 가능한 난수 생성기
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  // 외래 키 참조를 제거하기 위해 댓글·좋아요·찜 → 게시글 → 상품 → 사용자 순서로 삭제
  await prisma.articleComment.deleteMany();
  await prisma.articleLike.deleteMany();
  await prisma.productComment.deleteMany();
  await prisma.productFavorite.deleteMany();
  await prisma.article.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash(PASSWORD, 10);

  const users = inInputOrder(
    await prisma.user.createManyAndReturn({
      data: SEED_USERS.map((user) => ({ ...user, passwordHash })),
    }),
    SEED_USERS.map((user) => user.email),
    (user) => user.email,
  );

  const sellers = users.slice(0, SELLER_COUNT);
  const buyers = users.slice(SELLER_COUNT);

  // 좋아요할 사용자를 먼저 정하고 likeCount를 생성 시점에 넣는다.
  // 만든 뒤 update하면 @updatedAt이 바뀌어 모든 글이 수정된 것처럼 보인다.
  // i만큼 밀어서 고르면 글마다 사용자 조합이 달라지고, 한 글 안에서는 중복이 없다.
  const likersByArticle = Array.from({ length: ARTICLE_COUNT }, (_, i) =>
    Array.from({ length: pick(ARTICLE_LIKE_COUNTS, i) }, (_, j) =>
      pick(users, i + j),
    ),
  );

  const articleData = Array.from({ length: ARTICLE_COUNT }, (_, i) => {
    const topic = pick(ARTICLE_TOPICS, i);

    return {
      title: `${topic}.#${i + 1}`,
      content: `${topic}에 대한 ${i + 1}번째 글입니다.`,
      writerId: pick(users, i).id,
      likeCount: pick(likersByArticle, i).length,
    };
  });

  const articles = inInputOrder(
    await prisma.article.createManyAndReturn({ data: articleData }),
    articleData.map((article) => article.title),
    (article) => article.title,
  );

  const { count: articleLikeCount } = await prisma.articleLike.createMany({
    data: articles.flatMap((article, i) =>
      pick(likersByArticle, i).map((user) => ({
        userId: user.id,
        articleId: article.id,
      })),
    ),
  });

  const featured = articles.at(-1);
  if (!featured) throw new Error('게시글이 만들어지지 않았습니다.');

  const featuredComments = Array.from(
    { length: FEATURED_COMMENT_COUNT },
    (_, i) => ({
      content: `${i + 1}번째 댓글입니다.`,
      articleId: featured.id,
      writerId: pick(users, i).id,
    }),
  );

  const otherComments = articles.slice(-4, -1).flatMap((article, i) => [
    {
      content: '저도 궁금했어요.',
      articleId: article.id,
      writerId: pick(users, i + 1).id,
    },
    {
      content: '정리 잘 해 주셨네요!',
      articleId: article.id,
      writerId: pick(users, i + 2).id,
    },
  ]);

  const { count: commentCount } = await prisma.articleComment.createMany({
    data: [...featuredComments, ...otherComments],
  });

  const random = createRandom(RANDOM_SEED);

  // 게시글 좋아요와 같은 방식: 찜할 사용자를 먼저 정하고 favoriteCount를 생성 시점에 넣는다.
  const favoritersByProduct = Array.from({ length: PRODUCT_COUNT }, (_, i) =>
    Array.from({ length: pick(PRODUCT_FAVORITE_COUNTS, i) }, (_, j) =>
      pick(users, i + j),
    ),
  );

  const productData = Array.from({ length: PRODUCT_COUNT }, (_, i) => {
    const template = pick(PRODUCT_TEMPLATES, i);
    const editionIndex = Math.floor(i / PRODUCT_TEMPLATES.length);

    // 앞 판매자 수만큼은 1명당 1개씩 배정해 모든 판매자가 상품을 갖게 하고,
    // 나머지는 시드 랜덤으로 배정
    const seller =
      i < sellers.length
        ? pick(sellers, i)
        : pick(sellers, Math.floor(random() * sellers.length));

    return {
      name: `${template.name} ${pick(PRODUCT_EDITIONS, editionIndex)}`,
      description: template.description,
      price: template.price * (editionIndex + 1),
      tags: [...template.tags],
      sellerId: seller.id,
      favoriteCount: pick(favoritersByProduct, i).length,
    };
  });

  // 이름은 템플릿 10개 × 에디션 5개 조합이라 50개가 모두 다르다
  const products = inInputOrder(
    await prisma.product.createManyAndReturn({ data: productData }),
    productData.map((product) => product.name),
    (product) => product.name,
  );

  const { count: productFavoriteCount } =
    await prisma.productFavorite.createMany({
      data: products.flatMap((product, i) =>
        pick(favoritersByProduct, i).map((user) => ({
          userId: user.id,
          productId: product.id,
        })),
      ),
    });

  console.log(
    `seed 완료 : 사용자 ${users.length}(판매자 ${sellers.length}, 구매자 ${buyers.length}), 게시글 ${articles.length}, 댓글 ${commentCount}, 좋아요 ${articleLikeCount}, 상품 ${products.length}, 찜 ${productFavoriteCount}`,
  );

  console.log(
    `로그인 : ${SEED_USERS.map((u) => u.email).join(', ')} / ${PASSWORD}`,
  );

  console.log(`댓글이 많은 게시글 : id ${featured.id}`);

  const mostLiked = articles.reduce((top, article) =>
    article.likeCount > top.likeCount ? article : top,
  );
  console.log(
    `좋아요가 많은 게시글 : id ${mostLiked.id} (${mostLiked.likeCount}개)`,
  );

  const testUser = users.at(-1);
  if (!testUser) throw new Error('사용자가 만들어지지 않았습니다.');

  const likedByTestUser = articles
    .filter((_, i) =>
      pick(likersByArticle, i).some((user) => user.id === testUser.id),
    )
    .map((article) => article.id);
  console.log(
    `${testUser.email}이 좋아요한 게시글 : id ${likedByTestUser.join(', ')}`,
  );

  const mostFavorited = products.reduce((top, product) =>
    product.favoriteCount > top.favoriteCount ? product : top,
  );
  console.log(
    `찜이 많은 상품 : id ${mostFavorited.id} (${mostFavorited.favoriteCount}개)`,
  );

  const favoritedByTestUser = products
    .filter((_, i) =>
      pick(favoritersByProduct, i).some((user) => user.id === testUser.id),
    )
    .map((product) => product.id);
  console.log(
    `${testUser.email}이 찜한 상품 : id ${favoritedByTestUser.join(', ')}`,
  );
}

try {
  await main();
} catch (error) {
  console.error('seed 실패:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
