import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export default function setup() {
  const env = parseEnv(readFileSync('.env.test', 'utf8'));

  if(!env.DATABASE_URL?.includes('_test')) {
    throw new Error(`테스트 DB가 아닙니다 : ${env.DATABASE_URL}`);
  }

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, ...env },
    stdio: 'inherit'
  });
}