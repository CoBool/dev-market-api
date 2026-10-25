import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// compose.yaml의 postgres-test. 테스트가 모든 데이터를 지우므로 이 DB가 아니면 실행하지 않는다.
const TEST_DATABASE = {
  hostnames: ['127.0.0.1', 'localhost'],
  port: '5433',
  name: 'dev_market_test',
};

function assertTestDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) throw new Error('.env.test에 DATABASE_URL이 없습니다.');

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // 파싱에 실패한 값에도 비밀번호가 들어 있을 수 있어 출력하지 않는다
    throw new Error('.env.test의 DATABASE_URL 형식이 올바르지 않습니다.');
  }

  const name = url.pathname.slice(1);
  const isTestDatabase =
    TEST_DATABASE.hostnames.includes(url.hostname) &&
    url.port === TEST_DATABASE.port &&
    name === TEST_DATABASE.name;

  if (!isTestDatabase) {
    // 사용자 이름과 비밀번호는 출력하지 않는다
    throw new Error(
      `테스트 DB가 아닙니다 : ${url.hostname}:${url.port}/${name} (허용: 127.0.0.1:${TEST_DATABASE.port}/${TEST_DATABASE.name})`,
    );
  }
}

export default function setup() {
  const env = parseEnv(readFileSync('.env.test', 'utf8'));

  assertTestDatabase(env.DATABASE_URL);

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}
