import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { endAllSessions, endSession, findSession, RENEW_AFTER_MS, SESSION_MS, startSession } from './sessions.js';
import { addAccount, clearAccounts } from './test-accounts.js';

const t0 = new Date('2026-11-24T12:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);
const sessionCount = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>())!.n;

beforeEach(async () => {
  await clearAccounts();
  await addAccount('a1');
  await addAccount('a2', 'Bo', 'bo@example.com');
});

describe('sessions', () => {
  it('finds the account a token belongs to, and stores only its hash', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    expect(await findSession(env.DB, token, t0)).toEqual({ accountId: 'a1', renewed: false });
    expect(await findSession(env.DB, 'not-a-token', t0)).toBeNull();
    const stored = await env.DB.prepare('SELECT token_hash FROM sessions').first<{ token_hash: string }>();
    expect(stored!.token_hash).not.toContain(token);
  });

  it('renews at most once a day', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    expect((await findSession(env.DB, token, later(RENEW_AFTER_MS - 1)))!.renewed).toBe(false);
    expect((await findSession(env.DB, token, later(RENEW_AFTER_MS)))!.renewed).toBe(true);
    expect((await findSession(env.DB, token, later(RENEW_AFTER_MS + 1000)))!.renewed).toBe(false);
  });

  it('keeps a session in use going past 30 days', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    for (let day = 1; day <= 40; day++) expect(await findSession(env.DB, token, later(day * RENEW_AFTER_MS))).not.toBeNull();
  });

  it('expires after 30 idle days and deletes the row', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    expect(await findSession(env.DB, token, later(SESSION_MS - 1))).not.toBeNull();
    const renewedAt = later(SESSION_MS - 1);
    expect(await findSession(env.DB, token, new Date(renewedAt.getTime() + SESSION_MS))).toBeNull();
    expect(await sessionCount()).toBe(0);
  });

  it('clears the account’s expired sessions when it signs in again', async () => {
    await startSession(env.DB, 'a1', t0);
    await startSession(env.DB, 'a2', t0);
    await startSession(env.DB, 'a1', later(SESSION_MS));
    expect(await sessionCount()).toBe(2);
  });

  it('signs out one device, or every device of an account', async () => {
    const phone = await startSession(env.DB, 'a1', t0);
    const laptop = await startSession(env.DB, 'a1', t0);
    const other = await startSession(env.DB, 'a2', t0);
    await endSession(env.DB, phone);
    expect(await findSession(env.DB, phone, t0)).toBeNull();
    expect(await findSession(env.DB, laptop, t0)).not.toBeNull();
    await endAllSessions(env.DB, 'a1');
    expect(await findSession(env.DB, laptop, t0)).toBeNull();
    expect(await findSession(env.DB, other, t0)).not.toBeNull();
  });

  it('ends with its account', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind('a1').run();
    expect(await findSession(env.DB, token, t0)).toBeNull();
  });
});
