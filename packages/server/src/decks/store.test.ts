import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeScryfall } from '../cards/fake-scryfall.js';
import { createCardStore } from '../cards/store.js';
import type { ArchidektDeck } from './archidekt.js';
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
    ['deck_version_cards', 'deck_versions', 'decks', 'printings', 'cards'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
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
      expect.objectContaining({ ...VONA, name: 'Vona, Butcher of Magan', quantity: 1, commander: true, group: 'Creature', legendary: true, doubleFaced: false }),
      {
        ...SOL_RING,
        name: 'Sol Ring',
        quantity: 3,
        commander: false,
        group: 'Other permanent',
        legendary: false,
        doubleFaced: false,
        typeLine: 'Artifact',
        manaCost: '{1}',
        manaValue: 1,
        oracleText: '{T}: Add {C}{C}.',
        colorIdentity: [],
        known: false,
      },
      expect.objectContaining({
        name: 'Brightclimb Pathway // Grimclimb Pathway',
        group: 'Land',
        legendary: false,
        doubleFaced: true,
        typeLine: 'Land',
        manaCost: '',
        manaValue: 0,
        oracleText: '{T}: Add {W}.\n\n{T}: Add {B}.',
      }),
    ]);
    expect(deck.colorIdentity).toEqual(['W', 'B']);
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

    const imported = { source: 'pasted', importedAt: '2026-11-23T12:00:00.000Z' };
    expect(await store.list()).toEqual([
      { id: 'deck-2', name: 'Artifacts', commanders: [], colorIdentity: [], cardCount: 1, problems: 2, ...imported },
      {
        id: 'deck-1',
        name: 'vona',
        commanders: ['Vona, Butcher of Magan'],
        colorIdentity: ['W', 'B'],
        cardCount: 11,
        problems: 0,
        ...imported,
      },
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

  it('renames and deletes a Deck, keeping its versions for the games that use them (ADR 0119)', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', '1 Sol Ring');

    expect((await store.rename(id, 'Vona lifegain'))!.name).toBe('Vona lifegain');
    expect(await store.remove(id)).toBe(true);
    expect(await store.get(id)).toBeNull();
    expect(await store.remove(id)).toBe(false);
    expect(await versionCards(`${id}.1`)).toEqual([[SOL_RING.oracleId, 1, 0]]);
  });
});

/** A version's cards as [oracle id, quantity, commander], in order. */
async function versionCards(versionId: string) {
  const { results } = await env.DB.prepare(
    'SELECT oracle_id, quantity, commander FROM deck_version_cards WHERE version_id = ? ORDER BY position',
  )
    .bind(versionId)
    .all<{ oracle_id: string; quantity: number; commander: number }>();
  return results.map((r) => [r.oracle_id, r.quantity, r.commander]);
}

const versionNumbers = async (deckId: string) =>
  (await env.DB.prepare('SELECT number FROM deck_versions WHERE deck_id = ? ORDER BY number').bind(deckId).all<{ number: number }>()).results.map(
    (r) => r.number,
  );

describe('Deck versions (ADR 0119)', () => {
  it('makes a new version when the commander changes or a fixed line joins the cards, leaving earlier versions as they were', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n1 Sol Rnig');
    expect(await versionNumbers(id)).toEqual([1]);

    await store.markCommanders(id, [VONA.oracleId]);
    await store.fixLine(id, { index: 0, was: '1 Sol Rnig' }, '1 Sol Ring');
    expect(await versionNumbers(id)).toEqual([1, 2, 3]);
    expect(await versionCards(`${id}.1`)).toEqual([[VONA.oracleId, 1, 1]]);
    expect(await versionCards(`${id}.3`)).toEqual([
      [VONA.oracleId, 1, 1],
      [SOL_RING.oracleId, 1, 0],
    ]);
    expect((await store.get(id))!.cards.map((c) => c.name)).toEqual(['Vona, Butcher of Magan', 'Sol Ring']);
  });

  it('keeps the version for a rename, a skipped line, or a fix that still matches nothing', async () => {
    const store = deckStore();
    const { id } = await store.importList('Vona', '1 Sol Ring\nwhat is this\n1 Sol Rnig');
    await store.rename(id, 'Rings');
    await store.skipLine(id, { index: 0, was: 'what is this' });
    await store.fixLine(id, { index: 0, was: '1 Sol Rnig' }, '1 Sol Rnigg');
    expect(await versionNumbers(id)).toEqual([1]);
  });
});

describe('importing from Archidekt', () => {
  const deckOf = (name: string, cards: [string, string, string, string[]][]): ArchidektDeck => ({
    id: 28451037,
    name,
    categories: [
      { name: 'Commander', includedInDeck: true, isPremier: true },
      { name: 'Ramp', includedInDeck: true, isPremier: false },
    ],
    cards: cards.map(([uid, cardName, set, categories]) => ({
      quantity: 1,
      categories,
      card: { uid, collectorNumber: '1', edition: { editioncode: set }, oracleCard: { name: cardName, uid: '' } },
    })),
  });

  it('saves a new Deck, then replaces it, name and all, when the same Archidekt Deck is imported again (ADR 0079)', async () => {
    const store = deckStore();
    const first = await store.importArchidekt(
      deckOf('Vona', [
        [VONA.scryfallId, 'Vona, Butcher of Magan', 'lcc', ['Commander']],
        [SOL_RING.scryfallId, 'Sol Ring', 'trc', ['Ramp']],
      ]),
    );
    expect(first.updated).toBe(false);
    expect(first.deck).toMatchObject({ name: 'Vona', archidektId: '28451037' });
    await store.rename(first.deck.id, 'My name');

    const again = await store.importArchidekt(
      deckOf('Vona v2', [
        [SOL_RING.scryfallId, 'Sol Ring', 'trc', ['Commander']],
        ['00000000-0000-0000-0000-000000000000', 'Gone Card', 'xyz', ['Ramp']],
      ]),
    );

    expect(again.updated).toBe(true);
    expect(again.deck.id).toBe(first.deck.id);
    expect(again.deck.name).toBe('Vona v2');
    expect(again.deck.cards.map((c) => [c.name, c.commander])).toEqual([['Sol Ring', true]]);
    expect(again.deck.unmatched).toEqual([{ text: '1x Gone Card (xyz) 1', reason: 'not-found' }]);
    expect((await store.list()).map((d) => d.source)).toEqual(['archidekt']);
    expect(await versionNumbers(first.deck.id)).toEqual([1, 2]);
    expect(await versionCards(`${first.deck.id}.1`)).toEqual([
      [VONA.oracleId, 1, 1],
      [SOL_RING.oracleId, 1, 0],
    ]);
  });
});
