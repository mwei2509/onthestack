import { describe, expect, it } from 'vitest';
import { providersFromEnv } from './providers.js';

const keys = { ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', CLOUDFLARE_ACCOUNT_ID: 'c', CLOUDFLARE_API_TOKEN: 't' };
const ids = (env: Record<string, string | undefined>) => providersFromEnv(env).map((p) => p.id.split(':')[0]);

describe('providersFromEnv', () => {
  it('runs every provider with a key when EVAL_PROVIDERS is unset', () => {
    expect(ids(keys)).toEqual(['workers-ai', 'gemini', 'claude']);
  });

  it('treats an empty EVAL_PROVIDERS as unset, as the workflow sends when its input is left blank', () => {
    expect(ids({ ...keys, EVAL_PROVIDERS: '' })).toEqual(['workers-ai', 'gemini', 'claude']);
    expect(ids({ ...keys, EVAL_PROVIDERS: ' , ' })).toEqual(['workers-ai', 'gemini', 'claude']);
  });

  it('runs only the providers named', () => {
    expect(ids({ ...keys, EVAL_PROVIDERS: 'claude, gemini' })).toEqual(['gemini', 'claude']);
  });

  it('skips providers without keys', () => {
    expect(ids({ ANTHROPIC_API_KEY: 'a' })).toEqual(['claude']);
  });
});
