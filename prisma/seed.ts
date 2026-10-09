import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const PASSWORD = 'password1234';

const SEED_USERS = [
  { email: 'frontend_sangmin@gmail.com', nickname: '코딩하는코기' },
  { email: 'dev.danielle@naver.com', nickname: '버그퇴치반' },
  { email: 'react_master99@kakao.com', nickname: '커밋장인' },
];

const ARTICLE_TOPICS = [
  '판다마켓 이용 후기',
  'React 상태 관리 질문',
  'NestJS 공부 기록',
  '중고 거래 꿀팁',
  '오늘의 판다 사진',
];

const ARTICLE_COUNT = 25;
const FEATURED_COMMENT_COUNT = 18;

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
  if (item === undefined) throw new Error('빈 배열에서 고를 수 없습니다.')

  return item;
}

async function main() {
  await prisma.articleComment.deleteMany();
  await prisma.article.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash(PASSWORD, 10);

  const users = await prisma.user.createManyAndReturn({
    data: SEED_USERS.map((user) => ({ ...user, passwordHash }))
  });

  const articles = await prisma.article.createManyAndReturn({
    data: Array.from({ length: ARTICLE_COUNT }, (_, i) => {
      const topic = pick(ARTICLE_TOPICS, i);

      return {
        title: `${topic}.#${i + 1}`,
        content: `${topic}에 대한 ${i + 1}번째 글입니다.`,
        writerId: pick(users, i).id,
      }
    })
  });

  const featured = articles.at(-1);
  if (!featured) throw new Error('게시글이 만들어지지 않았습니다.');

  const featuredComments = Array.from(
    { length: FEATURED_COMMENT_COUNT },
    (_, i) => ({
      content: `${i + 1}번째 댓글입니다.`,
      articleId: featured.id,
      writerId: pick(users, i).id,
    })
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
    }
  ]);

  const { count: commentCount } = await prisma.articleComment.createMany({
    data: [...featuredComments, ...otherComments]
  });

  console.log(
    `seed 완료 : 사용자 ${users.length}, 게시글 ${articles.length}, 댓글 ${commentCount}`
  );

  console.log(
    `로그인 : ${SEED_USERS.map((u) => u.email).join(', ')} / ${PASSWORD}`
  );

  console.log(
    `댓글이 많은 게시글 : id ${featured.id}`
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