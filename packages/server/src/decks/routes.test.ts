import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeScryfall } from '../cards/fake-scryfall.js';
import { createCardStore } from '../cards/store.js';

const api = (path: string, init?: RequestInit) => exports.default.fetch(`http://test/api/decks${path}`, init);
const post = (body: unknown) =>
  api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Stored up front, so the routes resolve these from D1 and never call the real Scryfall.
beforeAll(async () => {
  const cards = createCardStore({ db: env.DB, fetch: fakeScryfall().fetch, sleep: async () => {}, now: () => new Date() });
  await cards.resolve([{ set: 'lcc', collectorNumber: '293' }, { name: 'Sol Ring' }]);
});

describe('/api/decks', () => {
  it('imports a pasted list, then lists and returns it', async () => {
    const created = await post({ name: ' Vona ', list: '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n1 Sol Ring' });
    expect(created.status).toBe(201);
    const deck = (await created.json()) as { id: string; name: string; cards: unknown[] };
    expect(deck.name).toBe('Vona');
    expect(deck.cards).toHaveLength(2);

    const library = (await (await api('')).json()) as { id: string }[];
    expect(library.map((d) => d.id)).toContain(deck.id);
    expect(await (await api(`/${deck.id}`)).json()).toEqual(deck);
  });

  it('refuses an import without a name or a list', async () => {
    const noName = await post({ name: '  ', list: '1 Sol Ring' });
    expect(noName.status).toBe(400);
    expect(await noName.json()).toEqual({ error: 'A Deck needs a name' });
    expect((await post({ name: 'Vona' })).status).toBe(400);
  });

  it("answers 404 for a Deck that doesn't exist", async () => {
    expect((await api('/no-such-deck')).status).toBe(404);
  });
});
