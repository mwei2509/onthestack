import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeScryfall } from '../cards/fake-scryfall.js';
import { createCardStore } from '../cards/store.js';
import { handleDecks } from './routes.js';
import { createDeckStore } from './store.js';

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

describe('/api/decks/:id', () => {
  const send = (path: string, method: string, body?: unknown) =>
    api(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? null : JSON.stringify(body) });

  async function importDeck() {
    const res = await post({ name: 'Vona', list: '1 Sol Ring\nnot a card line' });
    return ((await res.json()) as { id: string }).id;
  }

  it('renames, marks the commander and deletes', async () => {
    const id = await importDeck();
    expect(((await (await send(`/${id}`, 'PATCH', { name: 'Rings' })).json()) as { name: string }).name).toBe('Rings');

    const marked = await send(`/${id}`, 'PATCH', { commanders: ['6ad8011d-3471-4369-9d68-b264cc027487'] });
    expect(((await marked.json()) as { cards: { commander: boolean }[] }).cards[0]!.commander).toBe(true);
    expect((await send(`/${id}`, 'PATCH', { commanders: ['nope'] })).status).toBe(400);

    expect((await send(`/${id}`, 'DELETE')).status).toBe(204);
    expect((await send(`/${id}`, 'DELETE')).status).toBe(404);
  });

  it('skips an unmatched line, and answers 409 when the line has changed', async () => {
    const id = await importDeck();
    const skipped = await send(`/${id}/unmatched/0`, 'POST', { action: 'skip', was: 'not a card line' });
    expect(((await skipped.json()) as { unmatched: unknown[] }).unmatched).toEqual([]);

    const stale = await send(`/${id}/unmatched/0`, 'POST', { action: 'skip', was: 'not a card line' });
    expect(stale.status).toBe(409);
  });

  it('fixes an unmatched line', async () => {
    const id = await importDeck();
    const fixed = await send(`/${id}/unmatched/0`, 'POST', { action: 'fix', was: 'not a card line', text: '1 Vona, Butcher of Magan' });
    const deck = (await fixed.json()) as { cards: { name: string }[]; unmatched: unknown[] };
    expect(deck.cards.map((c) => c.name)).toEqual(['Sol Ring', 'Vona, Butcher of Magan']);
    expect(deck.unmatched).toEqual([]);
  });
});

describe('importing an Archidekt link', () => {
  it('refuses something that is not an Archidekt Deck link', async () => {
    const res = await post({ archidekt: 'https://moxfield.com/decks/abc' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That isn't an Archidekt Deck link" });
  });

  it('imports through the proxy: 201 the first time, 200 when it updates the Deck', async () => {
    const archidekt = (async () =>
      Response.json({
        id: 5,
        name: 'Rings',
        categories: [{ name: 'Ramp', includedInDeck: true, isPremier: false }],
        cards: [
          {
            quantity: 1,
            categories: ['Ramp'],
            card: {
              uid: 'fc817e07-c1f3-469f-9cf7-0945dea7400f',
              collectorNumber: '499',
              edition: { editioncode: 'trc' },
              oracleCard: { name: 'Sol Ring', uid: '6ad8011d-3471-4369-9d68-b264cc027487' },
            },
          },
        ],
      })) as unknown as typeof fetch;
    const store = createDeckStore({
      db: env.DB,
      cards: createCardStore({ db: env.DB, fetch: fakeScryfall().fetch, sleep: async () => {}, now: () => new Date() }),
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
    });
    const importLink = () =>
      handleDecks(
        new Request('http://test/api/decks', { method: 'POST', body: JSON.stringify({ archidekt: 'archidekt.com/decks/5' }) }),
        undefined,
        undefined,
        { store, fetch: archidekt },
      );

    expect((await importLink()).status).toBe(201);
    const updated = await importLink();
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { name: string }).name).toBe('Rings');
  });
});
