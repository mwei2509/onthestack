import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeScryfall } from '../cards/fake-scryfall.js';
import { createCardStore } from '../cards/store.js';
import { createDeckStore, DeckChanged, NotOnDeck } from './store.js';

const VONA = { oracleId: 'b1c56e23-eae6-47a1-a1cd-3a2d01621768', scryfallId: '27beed9c-a42e-46de-8fbc-885da337ae75' };
const SOL_RING = { oracleId: '6ad8011d-3471-4369-9d68-b264cc027487', scryfallId: 'fc817e07-c1f3-469f-9cf7-0945dea7400f' };

function deckStore() {
  let next = 0;
  const cards = createCardStore({ db: env.DB, fetch: fakeScryfall().fetch, sleep: async () => {}, now: () => new Date() });
  return createDeckStore({
    db: env.DB,
    cards,
    now: () => new Date('2026-11-23T12:00:00Z'),
    newId: () => `deck-${++next}`,
  });
}

beforeEach(async () => {
  await env.DB.batch(
    ['deck_cards', 'decks', 'printings', 'cards'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
});

describe('importing a pasted list', () => {
  it('saves at once with every matched card, keeping the rest as unmatched lines in order (ADR 0077)', async () => {
    const deck = await deckStore().importList(
      'Vona',
      [
        '1x Vona, Butcher of Magan (lcc) 293 [Commander{top}]',
        '1x Sol Rnig (trc) 499 [Ramp]',
        'what is this',
        '3x Sol Ring [Ramp]',
        '1x Brightclimb Pathway // Grimclimb Pathway [Land]',
      ].join('\n'),
    );

    expect(deck).toMatchObject({ id: 'deck-1', name: 'Vona', archidektId: null, importedAt: '2026-11-23T12:00:00.000Z' });
    expect(deck.cards).toEqual([
      { ...VONA, name: 'Vona, Butcher of Magan', quantity: 1, commander: true },
      { ...SOL_RING, name: 'Sol Ring', quantity: 3, commander: false },
      expect.objectContaining({ name: 'Brightclimb Pathway // Grimclimb Pathway', quantity: 1, commander: false }),
    ]);
    expect(deck.unmatched).toEqual([
      { text: '1x Sol Rnig (trc) 499 [Ramp]', reason: 'not-found' },
      { text: 'what is this', reason: 'unreadable' },
    ]);
  });

  it('takes the commander from a Commander heading', async () => {
    const deck = await deckStore().importList('Vona', 'Commander\n1 Vona, Butcher of Magan\nDeck\n1 Sol Ring');
    expect(deck.cards.map((c) => [c.name, c.commander])).toEqual([
      ['Vona, Butcher of Magan', true],
      ['Sol Ring', false],
    ]);
  });
});

describe('the library', () => {
  it('lists Decks by name with their commanders, card count and problems', async () => {
    const store = deckStore();
    await store.importList('vona', '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n10 Sol Ring');
    await store.importList('Artifacts', '1 Sol Ring\n1 Sol Rnig');

    expect(await store.list()).toEqual([
      { id: 'deck-2', name: 'Artifacts', commanders: [], cardCount: 1, problems: 2 },
      { id: 'deck-1', name: 'vona', commanders: ['Vona, Butcher of Magan'], cardCount: 11, problems: 0 },
    ]);
  });

  it("returns nothing for a Deck that doesn't exist", async () => {
    expect(await deckStore().get('nope')).toBeNull();
  });
});

describe('fixing a Deck', () => {
  const list = ['1 Sol Ring', '1x Vona, Butcher of Magn [Lifegain]', 'what is this'].join('\n');

  it('matches a fixed line and adds it to the Deck', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', list);

    const deck = await store.fixLine(id, { index: 0, was: '1x Vona, Butcher of Magn [Lifegain]' }, '1 Vona, Butcher of Magan');

    expect(deck!.cards.map((c) => c.name)).toEqual(['Sol Ring', 'Vona, Butcher of Magan']);
    expect(deck!.unmatched).toEqual([{ text: 'what is this', reason: 'unreadable' }]);
  });

  it('keeps a fixed line that still matches nothing, in its place, with its new text', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', list);

    const deck = await store.fixLine(id, { index: 0, was: '1x Vona, Butcher of Magn [Lifegain]' }, '1 Vona, Butcher');
    expect(deck!.unmatched).toEqual([
      { text: '1 Vona, Butcher', reason: 'not-found' },
      { text: 'what is this', reason: 'unreadable' },
    ]);

    const again = await store.fixLine(id, { index: 1, was: 'what is this' }, 'still nonsense');
    expect(again!.unmatched[1]).toEqual({ text: 'still nonsense', reason: 'unreadable' });
  });

  it('skips a line', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', list);

    const deck = await store.skipLine(id, { index: 1, was: 'what is this' });
    expect(deck!.unmatched.map((u) => u.text)).toEqual(['1x Vona, Butcher of Magn [Lifegain]']);
  });

  it('refuses to change a line someone else already changed', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', list);
    await store.skipLine(id, { index: 0, was: '1x Vona, Butcher of Magn [Lifegain]' });

    await expect(store.skipLine(id, { index: 0, was: '1x Vona, Butcher of Magn [Lifegain]' })).rejects.toThrow(
      DeckChanged,
    );
  });

  it('marks the commander, replacing any marked before, and only from the Deck', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n1 Sol Ring');

    const deck = await store.markCommanders(id, [SOL_RING.oracleId]);
    expect(deck!.cards.map((c) => [c.name, c.commander])).toEqual([
      ['Vona, Butcher of Magan', false],
      ['Sol Ring', true],
    ]);
    await expect(store.markCommanders(id, ['not-on-deck'])).rejects.toThrow(NotOnDeck);
  });

  it('renames and deletes a Deck, cards and all', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', '1 Sol Ring');

    expect((await store.rename(id, 'Vona lifegain'))!.name).toBe('Vona lifegain');
    expect(await store.remove(id)).toBe(true);
    expect(await store.get(id)).toBeNull();
    expect(await store.remove(id)).toBe(false);
    const left = await env.DB.prepare('SELECT count(*) AS n FROM deck_cards').first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});
