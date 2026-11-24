import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeScryfall } from './fake-scryfall.js';
import fixture from './scryfall-fixture.json';
import type { ScryfallCard } from './scryfall.js';
import { createCardStore } from './store.js';

const [solRing, vona, brightclimb, delver] = fixture as ScryfallCard[];

function storeWith(scryfall = fakeScryfall()) {
  const store = createCardStore({
    db: env.DB,
    fetch: scryfall.fetch,
    sleep: async () => {},
    now: () => new Date('2026-11-23T12:00:00Z'),
  });
  return { store, scryfall };
}

const found = (card: ScryfallCard) => ({ oracleId: card.oracle_id, scryfallId: card.id });

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM printings'), env.DB.prepare('DELETE FROM cards')]);
});

describe('the card store', () => {
  it('fetches every card it lacks in one Scryfall request, by whatever the Deck line gave', async () => {
    const { store, scryfall } = storeWith();

    const resolved = await store.resolve([
      { name: 'Sol Ring' },
      { set: 'LCC', collectorNumber: '293' },
      { name: 'Brightclimb Pathway' },
      { oracleId: delver!.oracle_id! },
      { scryfallId: solRing!.id },
    ]);

    expect(resolved).toEqual([found(solRing!), found(vona!), found(brightclimb!), found(delver!), found(solRing!)]);
    expect(scryfall.requests).toHaveLength(1);
  });

  it('answers from D1 once a card is stored', async () => {
    const { store, scryfall } = storeWith();
    await store.resolve([{ set: 'lcc', collectorNumber: '293' }, { name: 'Brightclimb Pathway' }]);

    const again = await store.resolve([
      { scryfallId: vona!.id },
      { set: 'LCC', collectorNumber: '293' },
      { name: 'brightclimb pathway' },
      { name: 'Brightclimb Pathway // Grimclimb Pathway' },
      { oracleId: vona!.oracle_id! },
    ]);

    expect(again).toEqual([found(vona!), found(vona!), found(brightclimb!), found(brightclimb!), found(vona!)]);
    expect(scryfall.requests).toHaveLength(1);
  });

  it("gives a name-only line a printing it already has instead of asking Scryfall (ADR 0073)", async () => {
    const { store, scryfall } = storeWith();
    await store.resolve([{ set: 'lcc', collectorNumber: '293' }]);

    expect(await store.resolve([{ name: 'Vona, Butcher of Magan' }])).toEqual([found(vona!)]);
    expect(scryfall.requests).toHaveLength(1);
  });

  it('leaves a line unmatched when Scryfall has no such card, and stores nothing for it', async () => {
    const { store } = storeWith();

    expect(await store.resolve([{ name: 'Sol Rnig' }, { name: 'Sol Ring' }])).toEqual([null, found(solRing!)]);
    const { count } = (await env.DB.prepare('SELECT count(*) AS count FROM cards').first<{ count: number }>())!;
    expect(count).toBe(1);
  });

  it("leaves a line unmatched when its name isn't the printing's card", async () => {
    const { store } = storeWith();

    expect(
      await store.resolve([
        { set: 'lcc', collectorNumber: '293', name: 'Sol Ring' },
        { set: 'lcc', collectorNumber: '293', name: 'Vona, Butcher of Magan' },
      ]),
    ).toEqual([null, found(vona!)]);
  });

  it("stores each printing's images and each card's trimmed data", async () => {
    const { store } = storeWith();
    await store.resolve([{ name: 'Sol Ring' }, { name: 'Brightclimb Pathway' }]);

    const { results } = await env.DB.prepare(
      'SELECT scryfall_id, set_code, collector_number, image_url, back_image_url FROM printings ORDER BY set_code',
    ).all();
    expect(results).toEqual([
      {
        scryfall_id: solRing!.id,
        set_code: solRing!.set,
        collector_number: solRing!.collector_number,
        image_url: solRing!.image_uris!.grid,
        back_image_url: null,
      },
      {
        scryfall_id: brightclimb!.id,
        set_code: 'znr',
        collector_number: '259',
        image_url: brightclimb!.card_faces![0]!.image_uris!.grid,
        back_image_url: brightclimb!.card_faces![1]!.image_uris!.grid,
      },
    ].sort((a, b) => a.set_code.localeCompare(b.set_code)));

    const cards = await store.get([solRing!.oracle_id!, brightclimb!.oracle_id!, 'not-stored']);
    expect([...cards.keys()].sort()).toEqual([solRing!.oracle_id, brightclimb!.oracle_id].sort());
    expect(cards.get(solRing!.oracle_id!)).toMatchObject({ name: 'Sol Ring', type_line: 'Artifact' });
    expect(cards.get(solRing!.oracle_id!)).not.toHaveProperty('prices');
  });

  it('updates a stored card when Scryfall returns it again for a new printing', async () => {
    const { store } = storeWith();
    await store.resolve([{ name: 'Sol Ring' }]);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM printings'),
      env.DB.prepare("UPDATE cards SET data = '{}', fetched_at = 'then'"),
    ]);

    expect(await store.resolve([{ set: 'trc', collectorNumber: '499' }])).toEqual([found(solRing!)]);

    const row = await env.DB.prepare('SELECT data, fetched_at FROM cards').first<{ data: string; fetched_at: string }>();
    expect(row!.fetched_at).toBe('2026-11-23T12:00:00.000Z');
    expect(JSON.parse(row!.data)).toMatchObject({ name: 'Sol Ring' });
  });
});
