import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      // A blank key, so no test can reach Anthropic with the real one `.env` gives `wrangler dev`; no event logs in test output.
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations'), ANTHROPIC_API_KEY: '', TEST_PHASE: 'false' } },
    })),
  ],
  test: { setupFiles: ['./src/test/apply-migrations.ts'] },
});
