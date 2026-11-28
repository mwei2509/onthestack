import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeScryfall } from './cards/fake-scryfall.js';
import { createCardStore } from './cards/store.js';
import { createDeckStore } from './decks/store.js';
import { handleSeed, type Seed } from './seed.js';

// The test Worker runs with LOCAL_DEV set (vitest.config.ts), so the handler is called directly to vary it.
const local = { ...env, LOCAL_DEV: 'true' };
const seedUrl = (games = '') => `http://test/api/dev/seed${games ? `?games=${games}` : ''}`;

beforeAll(async () => {
  const cards = createCardStore({ db: env.DB, fetch: fakeScryfall().fetch, sleep: async () => {}, now: () => new Date() });
  await createDeckStore({ db: env.DB, cards, now: () => new Date(), newId: () => 'seed-deck' }).importList('Seeded', '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n1 Sol Ring');
});

async function createGame(): Promise<string> {
  const res = await exports.default.fetch('http://test/api/games', { method: 'POST' });
  return ((await res.json()) as { code: string }).code;
}

describe('the local seed (ADR 0143)', () => {
  it('is only served in local development', async () => {
    expect((await handleSeed(new Request(seedUrl()), { ...env, LOCAL_DEV: undefined })).status).toBe(404);
  });

  it('reads every Deck with only the cards it uses, and the named games', async () => {
    const code = await createGame();
    const seed = (await (await handleSeed(new Request(seedUrl(code)), local)).json()) as Seed;
    expect(seed.tables.decks.map((d) => d.id)).toContain('seed-deck');
    expect(seed.tables.cards.map((c) => c.name).sort()).toEqual(expect.arrayContaining(['Sol Ring', 'Vona, Butcher of Magan']));
    expect(Object.keys(seed.games)).toEqual([code]);
    expect(seed.games[code]!.setup).toMatchObject({ code, started: false });
  });

  it('refuses a game that does not exist', async () => {
    expect((await handleSeed(new Request(seedUrl('NO-SUCH-00')), local)).status).toBe(404);
  });

  it('loads Decks and games back', async () => {
    const code = await createGame();
    const seed = (await (await handleSeed(new Request(seedUrl(code)), local)).json()) as Seed;
    await env.DB.prepare('DELETE FROM deck_version_cards').run();
    await env.DB.prepare('DELETE FROM deck_versions').run();
    await env.DB.prepare('DELETE FROM decks').run();

    const copy = 'COPY-GAME-01';
    const games = { [copy]: { ...seed.games[code]!, setup: { ...(seed.games[code]!.setup as object), code: copy } } };
    const res = await handleSeed(new Request(seedUrl(), { method: 'POST', body: JSON.stringify({ ...seed, games }) }), local);
    expect(await res.json()).toEqual({ decks: seed.tables.decks.length, games: [copy] });

    const decks = await env.DB.prepare('SELECT id FROM decks').all<{ id: string }>();
    expect(decks.results.map((d) => d.id)).toContain('seed-deck');
    const summary = await exports.default.fetch(`http://test/api/games/${copy}`);
    expect(await summary.json()).toEqual({ code: copy, status: 'lobby', turn: null });
  });
});
