import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Live evals read provider keys from packages/interpreter/.env (git-ignored) or the environment (ADR 0042).
export function readEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const at = line.indexOf('=');
    if (at < 1 || line.trimStart().startsWith('#')) continue;
    env[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

export default defineConfig({
  test: {
    include: ['src/**/*.eval.ts'],
    env: readEnvFile('.env'),
    testTimeout: 300_000,
    fileParallelism: false,
  },
});
