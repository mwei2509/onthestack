import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHALLENGE_MS } from './challenges.js';
import type { AccountDeps } from './routes.js';
import { TestAuthenticator } from './test-authenticator.js';
import { testBrowser, type TestBrowser } from './test-browser.js';
import { clearAccounts } from './test-accounts.js';

const SITE = 'https://onthestack.gg';
const t0 = new Date('2026-11-24T12:00:00Z');
let now: Date;
let ids: number;
let allowed: boolean;
const deps: AccountDeps = {
  db: env.DB,
  now: () => now,
  newId: () => `id-${++ids}`,
  limit: async () => allowed,
};

const browser = (origin = SITE, userAgent?: string) => testBrowser(deps, origin, userAgent);

const profile = { displayName: '  Ana ', email: 'ana@example.com' };

async function signUp(send: TestBrowser, key: TestAuthenticator, origin = SITE) {
  const options = await (await send('sign-up/options', profile)).json<never>();
  return send('sign-up', { ...profile, response: await key.register(options, origin) });
}

async function signIn(send: TestBrowser, key: TestAuthenticator, origin = SITE) {
  const options = await (await send('sign-in/options')).json<never>();
  return send('sign-in', { response: await key.authenticate(options, origin) });
}

const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

beforeEach(async () => {
  now = t0;
  ids = 0;
  allowed = true;
  await clearAccounts();
});

describe('signing up with a passkey', () => {
  it('makes the account, saves the passkey and signs in', async () => {
    const send = browser();
    const res = await signUp(send, new TestAuthenticator());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: { id: 'id-1', displayName: 'Ana', email: 'ana@example.com' } });
    expect(await (await send('', undefined, 'GET')).json()).toEqual({ account: expect.objectContaining({ id: 'id-1' }) });
    const passkey = await env.DB.prepare('SELECT kind, label FROM sign_ins').first();
    expect(passkey).toEqual({ kind: 'passkey', label: 'Safari on iPhone' });
  });

  it('asks for a discoverable passkey, with the screen lock if there is one', async () => {
    const options = await (await browser()('sign-up/options', profile)).json<{ authenticatorSelection: unknown; rp: unknown }>();
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'preferred' });
    expect(options.rp).toEqual({ name: 'On The Stack', id: 'onthestack.gg' });
  });

  it('stores nothing when the prompt is cancelled', async () => {
    await browser()('sign-up/options', profile);
    expect(await count('accounts')).toBe(0);
    expect(await count('sign_ins')).toBe(0);
  });

  it('checks the name and email', async () => {
    const send = browser();
    expect(await (await send('sign-up/options', { ...profile, displayName: ' ' })).json()).toEqual({ error: 'A name is needed' });
    expect(await (await send('sign-up/options', { ...profile, email: 'ana' })).json()).toEqual({
      error: "That doesn't look like an email",
    });
  });

  it('lets two accounts share an unverified email', async () => {
    expect((await signUp(browser(), new TestAuthenticator())).status).toBe(200);
    expect((await signUp(browser(), new TestAuthenticator())).status).toBe(200);
    expect(await count('accounts')).toBe(2);
  });

  it('refuses a passkey made for another site', async () => {
    const send = browser();
    const options = await (await send('sign-up/options', profile)).json<never>();
    const res = await send('sign-up', { ...profile, response: await new TestAuthenticator().register(options, 'https://evil.gg') });
    expect(await res.json()).toEqual({ error: "That passkey couldn't be checked. Try again." });
    expect(await count('accounts')).toBe(0);
  });

  it('refuses a challenge older than 5 minutes, and uses each challenge once', async () => {
    const send = browser();
    const key = new TestAuthenticator();
    const options = await (await send('sign-up/options', profile)).json<never>();
    const response = await key.register(options, SITE);
    now = new Date(t0.getTime() + CHALLENGE_MS);
    expect(await (await send('sign-up', { ...profile, response })).json()).toEqual({ error: 'That took too long. Try again.' });

    now = t0;
    const again = await (await send('sign-up/options', profile)).json<never>();
    const fresh = await key.register(again, SITE);
    const replay = browser();
    expect((await send('sign-up', { ...profile, response: fresh })).status).toBe(200);
    expect((await replay('sign-up', { ...profile, response: fresh })).status).toBe(400);
  });
});

describe('signing in with a passkey', () => {
  it('signs in to the passkey’s account on a new device', async () => {
    const key = new TestAuthenticator();
    await signUp(browser(), key);
    const laptop = browser();
    const res = await signIn(laptop, key);
    expect(await res.json()).toEqual({ account: expect.objectContaining({ id: 'id-1', displayName: 'Ana' }) });
    expect(await (await laptop('', undefined, 'GET')).json()).toEqual({ account: expect.objectContaining({ id: 'id-1' }) });
    expect(await count('sessions')).toBe(2);
  });

  it('lists no passkeys, so the device offers its own', async () => {
    const options = await (await browser()('sign-in/options')).json<{ allowCredentials?: unknown[]; userVerification: string }>();
    expect(options.allowCredentials ?? []).toEqual([]);
    expect(options.userVerification).toBe('preferred');
  });

  it('says so when the passkey has no account', async () => {
    const res = await signIn(browser(), await registered());
    expect(await res.json()).toEqual({ error: "This passkey isn't linked to an account anymore." });
  });

  it('refuses a forged signature', async () => {
    const key = new TestAuthenticator();
    await signUp(browser(), key);
    const send = browser();
    const options = await (await send('sign-in/options')).json<never>();
    const response = await key.authenticate(options, SITE, 'evil.gg');
    expect((await send('sign-in', { response })).status).toBe(400);
    expect(await count('sessions')).toBe(1);
  });

  it('works on localhost and Previews with their own passkeys', async () => {
    for (const origin of ['http://localhost:5190', 'https://pr-9-onthestack.onthestack.workers.dev']) {
      const key = new TestAuthenticator();
      expect((await signUp(browser(origin), key, origin)).status).toBe(200);
      expect((await signIn(browser(origin), key, origin)).status).toBe(200);
    }
  });

  it('refuses other origins', async () => {
    expect((await browser('https://evil.gg')('sign-in/options')).status).toBe(403);
  });

  it('is rate-limited', async () => {
    allowed = false;
    expect((await browser()('sign-in/options')).status).toBe(429);
    expect((await browser()('sign-up/options', profile)).status).toBe(429);
  });
});

async function registered(): Promise<TestAuthenticator> {
  const key = new TestAuthenticator();
  await key.register(
    { challenge: 'x', rp: { id: 'onthestack.gg', name: 'x' }, user: { id: 'x', name: 'x', displayName: 'x' }, pubKeyCredParams: [] },
    SITE,
  );
  return key;
}
