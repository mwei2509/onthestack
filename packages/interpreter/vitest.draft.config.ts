import { defineConfig } from 'vitest/config';
import { readEnvFile } from './vitest.eval.config.js';

// Drafts Translations on demand (ADR 0132), with the same provider keys as the live evals.
export default defineConfig({
  test: {
    include: ['src/**/*.draft.ts'],
    env: readEnvFile('.env'),
    testTimeout: 300_000,
    // Each draft is printed from a passing test, which Vitest hides by default.
    silent: false,
  },
});
