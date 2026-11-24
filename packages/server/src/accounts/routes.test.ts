import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleAccount } from './routes.js';
import { findSession, RENEW_AFTER_MS, startSession } from './sessions.js';
import { addAccount, clearAccounts } from './test-accounts.js';

const t0 = new Date('2026-11-24T12:00:00Z');
let now = t0;

const call = (rest: string | undefined, method: string, token?: string, origin = 'https://onthestack.gg') =>
  handleAccount(
    new Request(`${origin}/api/account${rest ? `/${rest}` : ''}`, {
      method,
      headers: token ? { Cookie: `theme=dark; session=${token}` } : {},
    }),
    rest,
    { db: env.DB, now: () => now, newId: () => crypto.randomUUID(), limit: async () => true },
  );

beforeEach(async () => {
  now = t0;
  await clearAccounts();
  await addAccount('a1');
});

describe('/api/account', () => {
  it('says nobody is signed in without a session', async () => {
    const res = await call(undefined, 'GET');
    expect(await res.json()).toEqual({ account: null });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('returns the signed-in account', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    const res = await call(undefined, 'GET', token);
    expect(await res.json()).toEqual({ account: { id: 'a1', displayName: 'Ana', email: 'ana@example.com' } });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('sends the cookie again when the session is renewed', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    now = new Date(t0.getTime() + RENEW_AFTER_MS);
    const cookie = (await call(undefined, 'GET', token)).headers.get('Set-Cookie')!;
    expect(cookie).toContain(`session=${token}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=2592000');
  });

  it('leaves Secure off over http://localhost', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    now = new Date(t0.getTime() + RENEW_AFTER_MS);
    expect((await call(undefined, 'GET', token, 'http://localhost:8790')).headers.get('Set-Cookie')).not.toContain('Secure');
  });

  it('clears a cookie whose session is gone', async () => {
    const res = await call(undefined, 'GET', 'stale');
    expect(await res.json()).toEqual({ account: null });
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('signs out this device', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    const other = await startSession(env.DB, 'a1', t0);
    const res = await call('sign-out', 'POST', token);
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await findSession(env.DB, token, t0)).toBeNull();
    expect(await findSession(env.DB, other, t0)).not.toBeNull();
  });

  it('signs out everywhere', async () => {
    const token = await startSession(env.DB, 'a1', t0);
    const other = await startSession(env.DB, 'a1', t0);
    expect((await call('sign-out-everywhere', 'POST', token)).status).toBe(204);
    expect(await findSession(env.DB, other, t0)).toBeNull();
    expect((await call('sign-out-everywhere', 'POST')).status).toBe(401);
  });

  it('answers 404 for anything else', async () => {
    expect((await call('nope', 'GET')).status).toBe(404);
    expect((await call(undefined, 'POST')).status).toBe(404);
  });
});
