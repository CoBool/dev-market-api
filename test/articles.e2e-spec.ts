import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserThrottlerGuard } from '../src/common/guards/user-throttler.guard.js';

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // 테스트용 사용자 A(작성자), B(다른 사람)
  let userA: { id: number; accessToken: string };
  let userB: { id: number; accessToken: string };

  // 회원가입 + 로그인해서 id와 accessToken을 돌려줌
  async function createUser(email: string, nickname: string) {
    const password = 'password1234';

    const signUp = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ email, nickname, password })
      .expect(201);

    const signIn = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email, password })
      .expect(200);

    return {
      id: signUp.body.id as number,
      accessToken: signIn.body.accessToken as string,
    };
  }

  // 검색 테스트에서 지정한 게시글을 오래된 순서부터 저장
  async function createArticles(
    articles: { title: string; content: string }[],
  ) {
    await prisma.article.createMany({
      data: articles.map((article) => ({ ...article, writerId: userA.id })),
    });
  }

  // LIKE 특수문자의 검색 동작을 확인할 게시글을 오래된 순서부터 저장
  async function createSpecialCharacterArticles() {
    await createArticles([
      { title: '50%할인', content: '아무거나' },
      { title: '일반 글', content: '아무거나' },
      { title: 'snake_case 변수명', content: '언더스코어 예시' },
      { title: '윈도우 경로', content: 'C:\\Users\\panda 폴더' },
    ]);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // POST /articles에 적용된 UserThrottlerGuard로 인해 연속 작성 테스트가 429로 실패하는 것을 방지
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // 게시글이 사용자를 참조하므로 게시글 → 사용자 순서로 삭제
    await prisma.article.deleteMany();
    await prisma.user.deleteMany();

    userA = await createUser('a@test.com', 'userA');
    userB = await createUser('b@test.com', 'userB');
  });

  beforeEach(async () => {
    await prisma.article.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /articles -> 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    expect(res.body).toMatchObject({
      title: '제목',
      content: '내용',
      writer: { id: userA.id, nickname: 'userA' },
    });
    expect(res.body.id).toEqual(expect.any(Number));
    // writerId는 writer.id와 중복이라 응답에서 제외됨
    expect(res.body).not.toHaveProperty('writerId');
  });

  it('GET /articles -> 최신순', async () => {
    // 1. 게시글 A 만들기
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: 'A', content: 'a' });

    // 2. 게시글 B 만들기
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: 'B', content: 'b' });

    // 3. 목록 조회
    const res = await request(app.getHttpServer()).get('/articles').expect(200);

    // 4. 나중에 만든 B가 먼저 와야 함
    const titles = res.body.items.map(
      (article: { title: string }) => article.title,
    );
    expect(titles).toEqual(['B', 'A']);
  });

  it('GET /articles 쿼리 없이 요청 -> 기본 페이지네이션 200', async () => {
    await prisma.article.createMany({
      data: [
        { title: '첫 글', content: '내용', writerId: userA.id },
        { title: '두 번째 글', content: '내용', writerId: userA.id },
      ],
    });

    const res = await request(app.getHttpServer()).get('/articles').expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      totalCount: 2,
      totalPages: 1,
    });
  });

  it('GET /articles?limit=10 게시글 15개 -> 첫 페이지 10개와 전체 페이지 수 200', async () => {
    await prisma.article.createMany({
      data: Array.from({ length: 15 }, (_, index) => ({
        title: `게시글 ${index + 1}`,
        content: '내용',
        writerId: userA.id,
      })),
    });

    const res = await request(app.getHttpServer())
      .get('/articles?limit=10')
      .expect(200);

    expect(res.body.items).toHaveLength(10);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      totalCount: 15,
      totalPages: 2,
    });
  });

  it('GET /articles?page=2&limit=10 두 번째 페이지 -> 첫 페이지와 겹치지 않음 200', async () => {
    await prisma.article.createMany({
      data: Array.from({ length: 15 }, (_, index) => ({
        title: `게시글 ${index + 1}`,
        content: '내용',
        writerId: userA.id,
      })),
    });

    const firstPage = await request(app.getHttpServer())
      .get('/articles?page=1&limit=10')
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/articles?page=2&limit=10')
      .expect(200);

    expect(secondPage.body.items).toHaveLength(5);
    const firstPageIds = firstPage.body.items.map(
      (item: { id: number }) => item.id,
    );
    const secondPageIds = secondPage.body.items.map(
      (item: { id: number }) => item.id,
    );
    expect(secondPageIds.some((id: number) => firstPageIds.includes(id))).toBe(
      false,
    );
    expect(secondPage.body.meta).toEqual({
      page: 2,
      limit: 10,
      totalCount: 15,
      totalPages: 2,
    });
  });

  it('GET /articles?page=2&limit=2 두 번째 페이지 -> 세 번째와 네 번째 최신 글 200', async () => {
    await prisma.article.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        title: `게시글 ${index + 1}`,
        content: '내용',
        writerId: userA.id,
      })),
    });

    // 기대값은 구현과 같은 쿼리(skip/take)로 만들지 않고 직접 정함
    // 최신순 [5번째, 4번째, 3번째, 2번째, 1번째] 중 page=2, limit=2 → 3번째, 2번째로 만든 글
    const created = await prisma.article.findMany({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const ids = created.map((article) => article.id);
    const expectedIds = [ids[2], ids[1]];

    const res = await request(app.getHttpServer())
      .get('/articles?page=2&limit=2')
      .expect(200);

    expect(res.body.items.map((item: { id: number }) => item.id)).toEqual(
      expectedIds,
    );
  });

  it('GET /articles?page=999 마지막 페이지보다 큰 페이지 -> 빈 목록과 전체 개수 200', async () => {
    await prisma.article.createMany({
      data: Array.from({ length: 3 }, (_, index) => ({
        title: `게시글 ${index + 1}`,
        content: '내용',
        writerId: userA.id,
      })),
    });

    const res = await request(app.getHttpServer())
      .get('/articles?page=999')
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.meta).toEqual({
      page: 999,
      limit: 10,
      totalCount: 3,
      totalPages: 1,
    });
  });

  it('GET /articles 게시글 0개 -> 빈 목록과 페이지 수 0', async () => {
    const res = await request(app.getHttpServer()).get('/articles').expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      totalCount: 0,
      totalPages: 0,
    });
  });

  it('GET /articles?page=2&limit=3 쿼리 값 숫자 변환 -> number 타입 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/articles?page=2&limit=3')
      .expect(200);

    expect(typeof res.body.meta.page).toBe('number');
    expect(typeof res.body.meta.limit).toBe('number');
  });

  it.each([
    ['page=0', '?page=0'],
    ['page=-1', '?page=-1'],
    ['page=1.5', '?page=1.5'],
    ['page=abc', '?page=abc'],
    ['limit=0', '?limit=0'],
    ['limit=51', '?limit=51'],
    ['limit=1e308', '?limit=1e308'],
    ['모르는 쿼리 파라미터', '?foo=bar'],
  ])('GET /articles 잘못된 쿼리 %s -> 400', async (_name, query) => {
    await request(app.getHttpServer()).get(`/articles${query}`).expect(400);
  });

  // page 에는 상한이 없다. 아무리 큰 값이어도 에러가 아니라 "빈 목록"이 정답이다.
  // 여기서 500 이 나면 offset 이 터진 것이므로, 상태코드보다 200 을 고정하는 것이 목적이다.
  it.each(['1e308', '9223372036854775807', '99999999999999999999'])(
    'GET /articles?page=%s page 상한이 없음 -> 200 + 빈 목록 (500 이 아니어야 한다)',
    async (page) => {
      await createArticles([{ title: '글 하나', content: '내용' }]);

      const res = await request(app.getHttpServer())
        .get(`/articles?page=${page}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalCount).toBe(1);
    },
  );

  it('GET /articles?keyword=노트북 검색어가 제목 또는 본문에 포함 -> 3개 200', async () => {
    await createArticles([
      { title: '노트북 팝니다', content: '상태 좋아요' },
      { title: '중고 거래', content: '노트북 있어요' },
      { title: '노트북 구해요', content: '노트북 찾습니다' },
      { title: '책상 팝니다', content: '의자도 있어요' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '노트북' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['노트북 구해요', '중고 거래', '노트북 팝니다'],
    );
  });

  it('GET /articles?searchType=title 제목 검색 -> 제목에 키워드가 있는 글만 200', async () => {
    await createArticles([
      { title: '노트북 팝니다', content: '상태 좋아요' },
      { title: '중고 거래', content: '노트북 있어요' },
      { title: '노트북 구해요', content: '노트북 찾습니다' },
      { title: '책상 팝니다', content: '의자도 있어요' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '노트북', searchType: 'title' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['노트북 구해요', '노트북 팝니다'],
    );
  });

  it('GET /articles?searchType=content 본문 검색 -> 본문에 키워드가 있는 글만 200', async () => {
    await createArticles([
      { title: '노트북 팝니다', content: '상태 좋아요' },
      { title: '중고 거래', content: '노트북 있어요' },
      { title: '노트북 구해요', content: '노트북 찾습니다' },
      { title: '책상 팝니다', content: '의자도 있어요' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '노트북', searchType: 'content' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['노트북 구해요', '중고 거래'],
    );
  });

  it('GET /articles?keyword=nestjs 대소문자 구분 없이 검색 -> 200', async () => {
    await createArticles([
      { title: 'NestJS 가이드', content: '서버 개발' },
      { title: '다른 글', content: '검색 대상 아님' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: 'nestjs' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['NestJS 가이드'],
    );
  });

  it('GET /articles?keyword=노트북 검색 메타 정보 -> 검색 결과 기준 200', async () => {
    await createArticles([
      { title: '노트북 하나', content: '판매' },
      { title: '무관한 글 1', content: '내용' },
      { title: '노트북 둘', content: '판매' },
      ...Array.from({ length: 12 }, (_, index) => ({
        title: `무관한 글 ${index + 2}`,
        content: '검색어 없음',
      })),
      { title: '노트북 셋', content: '판매' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '노트북', limit: 2 })
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 2,
      totalCount: 3,
      totalPages: 2,
    });
  });

  it('GET /articles?keyword=노트북&page=2&limit=2 검색 결과 안에서 페이지네이션 -> 200', async () => {
    await createArticles([
      { title: '노트북 1', content: '판매' },
      { title: '관계없는 글 A', content: '내용' },
      { title: '노트북 2', content: '판매' },
      { title: '관계없는 글 B', content: '내용' },
      { title: '노트북 3', content: '판매' },
      { title: '노트북 4', content: '판매' },
      { title: '관계없는 글 C', content: '내용' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '노트북', page: 2, limit: 2 })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['노트북 2', '노트북 1'],
    );
    expect(res.body.meta).toEqual({
      page: 2,
      limit: 2,
      totalCount: 4,
      totalPages: 2,
    });
  });

  it('GET /articles?searchType=title keyword 없이 요청 -> 전체 목록 200', async () => {
    await createArticles([
      { title: '노트북 팝니다', content: '상태 좋아요' },
      { title: '중고 거래', content: '노트북 있어요' },
      { title: '책상 팝니다', content: '의자도 있어요' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ searchType: 'title' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['책상 팝니다', '중고 거래', '노트북 팝니다'],
    );
    expect(res.body.meta.totalCount).toBe(3);
  });

  it('GET /articles?keyword=없는검색어 결과 없음 -> 빈 목록과 검색 메타 정보 200', async () => {
    await createArticles([
      { title: '책상 팝니다', content: '의자도 있어요' },
      { title: '의자 팝니다', content: '책상도 있어요' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '없는검색어' })
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.meta.totalCount).toBe(0);
    expect(res.body.meta.totalPages).toBe(0);
  });

  it.each([
    ['허용되지 않은 searchType', { keyword: '노트북', searchType: 'writer' }],
    ['51자 keyword', { keyword: '가'.repeat(51) }],
  ])('GET /articles 잘못된 검색 쿼리 %s -> 400', async (_name, query) => {
    await request(app.getHttpServer())
      .get('/articles')
      .query(query)
      .expect(400);
  });

  it('GET /articles?keyword=% 퍼센트 문자를 그대로 검색 -> 해당 글만 200', async () => {
    await createSpecialCharacterArticles();

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '%' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['50%할인'],
    );
  });

  it('GET /articles?keyword=_ 언더스코어 문자를 그대로 검색 -> 해당 글만 200', async () => {
    await createSpecialCharacterArticles();

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '_' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['snake_case 변수명'],
    );
  });

  it('GET /articles?keyword=\\ 백슬래시 문자를 본문에서 그대로 검색 -> 해당 글만 200', async () => {
    await createSpecialCharacterArticles();

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '\\' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['윈도우 경로'],
    );
  });

  it('GET /articles?keyword=%&searchType=content 본문에서 퍼센트 문자 검색 -> 결과 없음과 검색 메타 200', async () => {
    await createSpecialCharacterArticles();

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '%', searchType: 'content' })
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.meta.totalCount).toBe(0);
    expect(res.body.meta.totalPages).toBe(0);
  });

  it('GET /articles?keyword=+할인+ 앞뒤 공백을 제거하고 검색 -> 해당 글만 200', async () => {
    await createSpecialCharacterArticles();

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: ' 할인 ' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['50%할인'],
    );
  });

  it('GET /articles 공백만 있는 keyword -> 전체 목록 200', async () => {
    await createSpecialCharacterArticles();

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: '   ' })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      ['윈도우 경로', 'snake_case 변수명', '일반 글', '50%할인'],
    );
    expect(res.body.meta.totalCount).toBe(4);
  });

  it('GET /articles keyword 앞뒤 공백을 제외한 50자 -> 200', async () => {
    const keyword = '가'.repeat(50);
    await createArticles([
      { title: keyword, content: '50자 제목' },
      { title: '다른 글', content: '검색 대상 아님' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: ` ${keyword} ` })
      .expect(200);

    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(
      [keyword],
    );
  });

  it('GET /articles keyword 앞뒤 공백을 제외해도 51자 -> 400', async () => {
    await request(app.getHttpServer())
      .get('/articles')
      .query({ keyword: ` ${'가'.repeat(51)} ` })
      .expect(400);
  });

  it('POST /articles 빈 본문 -> 400', async () => {
    await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({})
      .expect(400);
  });

  it('GET /articles/:id 단건 조회 -> 200', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '단건', content: '조회' })
      .expect(201);

    // 방금 만든 글로 단건 조회
    const res = await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);

    expect(res.body).toEqual(created.body);
  });

  it('GET /articles/:id 존재하지 않는 글 -> 404', async () => {
    // 존재하지 않는 게시글 ID로 조회
    const res = await request(app.getHttpServer())
      .get(`/articles/99999`) // 존재하지 않는 ID
      .expect(404);

    expect(res.body).toMatchObject({ message: '게시글을 찾을 수 없습니다.' });
  });

  it.each([
    ['숫자가 아닌 값', 'abc'],
    ['0', '0'],
    ['음수', '-5'],
    ['0으로 시작', '01'],
    ['16진수 표기', '0x10'],
    ['지수 표기', '1e3'],
    ['소수점 표기', '1.0'],
    ['앞 공백', '%207'],
    ['지수 표기의 큰 값', '1e308'],
  ])('GET /articles/:id 형식이 잘못된 id(%s) -> 400', async (_name, id) => {
    // id는 양의 십진 정수 문자열만 받는다 (Number()가 0x10, 1e3, 1.0, 앞 공백도 숫자로 바꾸기 때문)
    const res = await request(app.getHttpServer())
      .get(`/articles/${id}`)
      .expect(400);

    expect(res.body.message).toContain('id must be an integer number');
  });

  it.each([
    ['int32 범위를 넘는 값', '2147483648'],
    ['int64를 훨씬 넘는 값', '99999999999999999999'],
  ])('GET /articles/:id %s -> 400', async (_name, id) => {
    // 형식은 맞지만 id는 Int(32비트 정수) 컬럼이라 이 범위를 넘으면 Prisma가 500을 만든다
    const res = await request(app.getHttpServer())
      .get(`/articles/${id}`)
      .expect(400);

    expect(res.body.message).toEqual([
      'id must not be greater than 2147483647',
    ]);
  });

  it.each([
    ['한 자리 최솟값', '1'],
    ['한 자리', '7'],
  ])(
    'GET /articles/:id %s -> 404 (검증은 통과, 존재하지 않는 글)',
    async (_name, id) => {
      // 형식이 올바른 작은 id는 400이 아니라 조회까지 가야 한다 (beforeEach에서 게시글을 비움)
      const res = await request(app.getHttpServer())
        .get(`/articles/${id}`)
        .expect(404);

      expect(res.body.message).toEqual('게시글을 찾을 수 없습니다.');
    },
  );

  it('GET /articles/:id int32 최댓값 -> 404 (검증은 통과, 존재하지 않는 글)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/articles/2147483647`)
      .expect(404);

    expect(res.body.message).toEqual('게시글을 찾을 수 없습니다.');
  });

  it('PATCH /articles/:id 정상수정 -> 200', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 전 제목', content: '수정 전 내용' })
      .expect(201);

    // 게시글 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 된 제목', content: '수정 된 내용' })
      .expect(200);

    // 수정 된 게시글 확인
    expect(res.body).toMatchObject({
      id: created.body.id,
      title: '수정 된 제목',
      content: '수정 된 내용',
    });

    // 수정한 데이터가 DB에 제대로 반영되었는지 확인
    const updated = await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);

    expect(updated.body).toEqual(res.body);
  });

  it('PATCH /articles/:id 존재하지 않는 글 -> 404', async () => {
    // 존재하지 않는 게시글 ID로 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/99999`) // 존재하지 않는 ID
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 할 제목', content: '수정 할 내용' })
      .expect(404);

    expect(res.body).toMatchObject({
      message: '게시글을 찾을 수 없습니다.',
    });
  });

  it('PATCH /articles/:id 제목 빈값 -> 400', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '수정 전 제목', content: '수정 전 내용' })
      .expect(201);

    // 게시글 수정
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: null, content: '수정 된 내용' })
      .expect(400);

    expect(res.body.message).toContain('title must be a string');
  });

  it('DELETE /articles/:id 정상삭제 -> 204', async () => {
    // 게시글 1개 미리 만들기
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '삭제 전 제목', content: '삭제 전 내용' })
      .expect(201);

    // 게시글 삭제
    await request(app.getHttpServer())
      .delete(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(204);

    // 정말 지워졌는지 다시 조회
    await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(404);
  });

  it('DELETE /articles/:id 없는 id 삭제 -> 404', async () => {
    // 게시글 삭제
    const res = await request(app.getHttpServer())
      .delete(`/articles/99999`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);

    expect(res.body).toMatchObject({
      message: '게시글을 찾을 수 없습니다.',
    });
  });

  it('POST /articles 모르는 필드 입력 -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용', price: 1000 })
      .expect(400);

    expect(res.body.message).toContain('property price should not exist');
  });

  it('POST /articles 토큰 없음 -> 401', async () => {
    await request(app.getHttpServer())
      .post('/articles')
      .send({ title: '제목', content: '내용' })
      .expect(401);
  });

  it('POST /articles 삭제된 사용자의 토큰 -> 409', async () => {
    const deletedUser = await createUser(
      'deleted-article-user@test.com',
      'deletedArticleUser',
    );

    // 이 사용자는 게시글이 없으므로 외래 키 제약에 걸리지 않고 삭제할 수 있음
    await prisma.user.delete({ where: { id: deletedUser.id } });

    // JwtAuthGuard는 토큰 서명만 확인하므로 통과하고, DB의 외래 키 제약에서 막힌다.
    // 원래는 Guard에서 401이 맞으며, 회원 탈퇴 기능 때 처리 예정
    const res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${deletedUser.accessToken}`)
      .send({ title: '삭제된 사용자 글', content: '생성되면 안 되는 글' })
      .expect(409);

    expect(res.body.message).toEqual(
      '참조 관계 때문에 요청을 처리할 수 없습니다.',
    );
    expect(
      await prisma.article.count({ where: { title: '삭제된 사용자 글' } }),
    ).toBe(0);
  });

  it('PATCH /articles/:id 본문 없음 -> 400', async () => {
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    // 본문 없이 요청 (Express 5에서 body가 undefined)
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(400);

    expect(res.body.message).toEqual('수정할 내용이 없습니다.');

    // 빈 객체도 400
    await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({})
      .expect(400);
  });

  it('PATCH /articles/:id 다른 사람 글 -> 403', async () => {
    // A가 작성
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    // B가 수정 시도
    const res = await request(app.getHttpServer())
      .patch(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ title: '남의 글 수정' })
      .expect(403);

    expect(res.body.message).toEqual('작성자만 수정할 수 있습니다.');

    // 실제로 바뀌지 않았는지 확인
    const after = await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);

    expect(after.body.title).toEqual('제목');
  });

  it('DELETE /articles/:id 다른 사람 글 -> 403', async () => {
    // A가 작성
    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ title: '제목', content: '내용' })
      .expect(201);

    // B가 삭제 시도
    const res = await request(app.getHttpServer())
      .delete(`/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);

    expect(res.body.message).toEqual('작성자만 삭제할 수 있습니다.');

    // 아직 남아 있는지 확인
    await request(app.getHttpServer())
      .get(`/articles/${created.body.id}`)
      .expect(200);
  });
});
