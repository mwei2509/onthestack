import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { claimJoinCode, findGameByJoinCode, IDLE_MS, touchJoinCode } from './joinCodes.js';

const t0 = new Date('2026-11-24T12:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);
const always = (value: number) => () => value;

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM join_codes').run();
});

describe('join codes', () => {
  it('gives a game a six-digit code that finds it', async () => {
    const code = await claimJoinCode(env.DB, 'KITE-MOSS-42', t0, always(4829));
    expect(code).toBe('004829');
    expect(await findGameByJoinCode(env.DB, '004829', t0)).toBe('KITE-MOSS-42');
    expect(await findGameByJoinCode(env.DB, '123456', t0)).toBeNull();
  });

  it('never gives two live games the same code', async () => {
    await claimJoinCode(env.DB, 'KITE-MOSS-42', t0, always(1));
    expect(await claimJoinCode(env.DB, 'WOLF-REED-07', t0, always(1))).toBeNull();
    const tries = [1, 1, 2];
    expect(await claimJoinCode(env.DB, 'WOLF-REED-07', t0, () => tries.shift()!)).toBe('000002');
  });

  it('retires a code after 24 hours idle, so a new game can have it', async () => {
    await claimJoinCode(env.DB, 'KITE-MOSS-42', t0, always(1));
    const dayLater = later(IDLE_MS + 1);
    expect(await findGameByJoinCode(env.DB, '000001', dayLater)).toBeNull();
    expect(await claimJoinCode(env.DB, 'WOLF-REED-07', dayLater, always(1))).toBe('000001');
    expect(await findGameByJoinCode(env.DB, '000001', dayLater)).toBe('WOLF-REED-07');
    expect(await touchJoinCode(env.DB, '000001', 'KITE-MOSS-42', dayLater)).toBe(false);
  });

  it('keeps a code while its game stays active', async () => {
    await claimJoinCode(env.DB, 'KITE-MOSS-42', t0, always(1));
    expect(await touchJoinCode(env.DB, '000001', 'KITE-MOSS-42', later(IDLE_MS - 1000))).toBe(true);
    expect(await findGameByJoinCode(env.DB, '000001', later(IDLE_MS + 1000))).toBe('KITE-MOSS-42');
    expect(await claimJoinCode(env.DB, 'WOLF-REED-07', later(IDLE_MS + 1000), always(1))).toBeNull();
  });
});
