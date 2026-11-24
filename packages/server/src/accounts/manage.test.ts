import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountDeps } from './routes.js';
import { TestAuthenticator } from './test-authenticator.js';
import { clearAccounts } from './test-accounts.js';
import { testBrowser, type TestBrowser } from './test-browser.js';

const SITE = 'https://onthestack.gg';
const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';
let now: Date;
let ids: number;
const deps: AccountDeps = { db: env.DB, now: () => now, newId: () => `id-${++ids}`, limit: async () => true };
const profile = { displayName: 'Ana', email: 'ana@example.com' };

async function signedUp(): Promise<{ send: TestBrowser; key: TestAuthenticator }> {
  const send = testBrowser(deps, SITE);
  const key = new TestAuthenticator();
  const options = await (await send('sign-up/options', profile)).json<never>();
  await send('sign-up', { ...profile, response: await key.register(options, SITE) });
  return { send, key };
}

async function addPasskey(send: TestBrowser, key = new TestAuthenticator()) {
  const options = await (await send('passkeys/options')).json<never>();
  return send('passkeys', { response: await key.register(options, SITE) });
}

const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

beforeEach(async () => {
  now = new Date('2026-11-24T12:00:00Z');
  ids = 0;
  await clearAccounts();
});

describe('the account page', () => {
  it('needs a signed-in account', async () => {
    const send = testBrowser(deps, SITE);
    for (const [rest, method] of [
      ['', 'PATCH'],
      ['', 'DELETE'],
      ['passkeys', 'GET'],
      ['passkeys', 'POST'],
      ['passkeys/options', 'POST'],
      ['passkeys/id-2', 'DELETE'],
    ] as const) {
      expect((await send(rest, method === 'GET' ? undefined : {}, method)).status).toBe(401);
    }
  });

  it('changes the display name and email', async () => {
    const { send } = await signedUp();
    const res = await send('', { displayName: ' Ana B ' }, 'PATCH');
    expect(await res.json()).toEqual({ account: { id: 'id-1', displayName: 'Ana B', email: 'ana@example.com' } });
    expect(await (await send('', { email: 'ana@new.example' }, 'PATCH')).json()).toEqual({
      account: { id: 'id-1', displayName: 'Ana B', email: 'ana@new.example' },
    });
    expect((await send('', { displayName: '' }, 'PATCH')).status).toBe(400);
    expect((await send('', {}, 'PATCH')).status).toBe(400);
  });

  it('lists passkeys with their label and dates', async () => {
    const { send } = await signedUp();
    expect(await (await send('passkeys', undefined, 'GET')).json()).toEqual([
      { id: 'id-2', label: 'Safari on iPhone', createdAt: now.toISOString(), usedAt: now.toISOString() },
    ]);
  });

  it('adds a second passkey that can sign in on its own', async () => {
    const { send } = await signedUp();
    const laptopKey = new TestAuthenticator();
    const options = await (await send('passkeys/options')).json<{ user: { id: string }; excludeCredentials: unknown[] }>();
    expect(options.excludeCredentials).toHaveLength(1);
    expect(options.user.id).toBe(btoa('id-1').replace(/=+$/, ''));
    const res = await send('passkeys', { response: await laptopKey.register(options as never, SITE) });
    expect(res.status).toBe(201);
    expect((await res.json<{ label: string }[]>()).map((p) => p.label)).toEqual(['Safari on iPhone', 'Safari on iPhone']);

    const laptop = testBrowser(deps, SITE, LAPTOP);
    const signIn = await (await laptop('sign-in/options')).json<never>();
    const signedInRes = await laptop('sign-in', { response: await laptopKey.authenticate(signIn, SITE) });
    expect(await signedInRes.json()).toEqual({ account: expect.objectContaining({ id: 'id-1' }) });
  });

  it('removes a passkey, but never the last one', async () => {
    const { send, key } = await signedUp();
    await addPasskey(send);
    const res = await send('passkeys/id-2', undefined, 'DELETE');
    expect(res.status).toBe(204);
    const [left] = await (await send('passkeys', undefined, 'GET')).json<{ id: string }[]>();
    const last = await send(`passkeys/${left!.id}`, undefined, 'DELETE');
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({ error: 'Add another passkey before removing this one' });

    const signIn = await (await send('sign-in/options')).json<never>();
    expect(await (await send('sign-in', { response: await key.authenticate(signIn, SITE) })).json()).toEqual({
      error: "This passkey isn't linked to an account anymore.",
    });
  });

  it("can't remove another account's passkey", async () => {
    const { send } = await signedUp();
    await addPasskey(send);
    const { send: bo } = await signedUp();
    expect((await bo('passkeys/id-2', undefined, 'DELETE')).status).toBe(404);
    expect(await count('sign_ins')).toBe(3);
  });

  it('deletes the account with its email, passkeys and sessions', async () => {
    const { send, key } = await signedUp();
    await addPasskey(send);
    const laptop = testBrowser(deps, SITE, LAPTOP);
    const signIn = await (await laptop('sign-in/options')).json<never>();
    await laptop('sign-in', { response: await key.authenticate(signIn, SITE) });
    expect(await count('sessions')).toBe(2);

    const res = await send('', undefined, 'DELETE');
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await count('accounts')).toBe(0);
    expect(await count('sign_ins')).toBe(0);
    expect(await count('sessions')).toBe(0);
    expect(await (await laptop('', undefined, 'GET')).json()).toEqual({ account: null });
  });
});
