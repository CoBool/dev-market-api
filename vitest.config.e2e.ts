import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // 모든 e2e 파일이 같은 테스트 DB를 쓰므로 파일을 하나씩 순서대로 실행
    fileParallelism: false,
    env: parseEnv(readFileSync('.env.test', 'utf8')),
  },
});
