import { describe, expect, it } from 'vitest';
import { archidektIdOf, ArchidektUnavailable, entriesOf, fetchArchidektDeck, type ArchidektDeck } from './archidekt.js';
import vona from './vona-archidekt.json';

describe('archidektIdOf', () => {
  it.each([
    ['https://archidekt.com/decks/28451037/vona', '28451037'],
    ['archidekt.com/decks/28451037', '28451037'],
    ['https://www.archidekt.com/decks/28451037/vona?tab=cards', '28451037'],
    ['  https://archidekt.com/decks/28451037#x ', '28451037'],
    ['https://moxfield.com/decks/abc', null],
    ['https://archidekt.com/decks/vona', null],
    ['https://evil.example/archidekt.com/decks/1', null],
  ])('%s → %s', (link, id) => {
    expect(archidektIdOf(link)).toBe(id);
  });
});

describe('entriesOf', () => {
  it('reads every card of a real Deck, with its printing and the commander', () => {
    const entries = entriesOf(vona as ArchidektDeck);
    expect(entries).toHaveLength(80);
    expect(entries.reduce((n, e) => n + e.quantity, 0)).toBe(100);
    expect(entries.filter((e) => e.commander)).toEqual([
      {
        request: { scryfallId: '27beed9c-a42e-46de-8fbc-885da337ae75', name: 'Vona, Butcher of Magan' },
        quantity: 1,
        commander: true,
        text: '1x Vona, Butcher of Magan (lcc) 293',
      },
    ]);
  });

  it('leaves out Sideboard, Maybeboard and any category not in the Deck', () => {
    const card = (name: string, categories: string[]) => ({
      quantity: 1,
      categories,
      card: { uid: name, collectorNumber: '1', edition: { editioncode: 'set' }, oracleCard: { name, uid: name } },
    });
    const deck: ArchidektDeck = {
      id: 1,
      name: 'Test',
      categories: [
        { name: 'Ramp', includedInDeck: true, isPremier: false },
        { name: 'Sideboard', includedInDeck: true, isPremier: false },
        { name: 'Maybeboard', includedInDeck: false, isPremier: false },
        { name: 'Considering', includedInDeck: false, isPremier: false },
      ],
      cards: [
        card('Sol Ring', ['Ramp']),
        card('Side', ['Sideboard']),
        card('Maybe', ['Maybeboard']),
        card('Considered', ['Considering']),
        card('Uncategorised', []),
      ],
    };
    expect(entriesOf(deck).map((e) => e.request)).toEqual([
      { scryfallId: 'Sol Ring', name: 'Sol Ring' },
      { scryfallId: 'Uncategorised', name: 'Uncategorised' },
    ]);
  });
});

describe('fetchArchidektDeck', () => {
  const answering = (status: number, seen: Request[] = []) =>
    (async (url: string, init: RequestInit) => {
      seen.push(new Request(url, init));
      return status === 200 ? Response.json(vona) : new Response('', { status });
    }) as typeof fetch;

  it("asks Archidekt's deck endpoint, saying who we are", async () => {
    const seen: Request[] = [];
    const deck = await fetchArchidektDeck('28451037', answering(200, seen));
    expect(deck.name).toBe('Vona');
    expect(seen[0]!.url).toBe('https://archidekt.com/api/decks/28451037/');
    expect(seen[0]!.headers.get('User-Agent')).toMatch(/^OnTheStack\//);
  });

  it('explains a private or missing Deck, and an Archidekt outage', async () => {
    await expect(fetchArchidektDeck('1', answering(404))).rejects.toThrow(/private/);
    await expect(fetchArchidektDeck('1', answering(403))).rejects.toThrow(/private/);
    await expect(fetchArchidektDeck('1', answering(500))).rejects.toThrow(ArchidektUnavailable);
  });
});
