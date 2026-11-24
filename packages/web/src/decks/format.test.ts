import { describe, expect, it } from 'vitest';
import { deckMeta, lineCount, matchesSearch, nameFromList, sinceDay } from './format.js';

const now = new Date(2026, 10, 24, 9, 0);
const daysAgo = (n: number) => new Date(2026, 10, 24 - n, 20, 0).toISOString();

describe('sinceDay', () => {
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [3, 'days ago'],
    [8, 'last week'],
    [20, '2 weeks ago'],
    [40, 'last month'],
  ])('%i days → %s', (n, text) => {
    expect(sinceDay(daysAgo(n), now)).toContain(text);
  });

  it('names the month after two months', () => {
    expect(sinceDay(new Date(2026, 2, 10).toISOString(), now)).toBe('in March');
  });
});

describe('deckMeta', () => {
  it('says where a Deck came from', () => {
    expect(deckMeta({ cardCount: 100, source: 'archidekt', importedAt: daysAgo(0) }, now)).toBe(
      '100 cards · Archidekt · updated today',
    );
    expect(deckMeta({ cardCount: 1, source: 'pasted', importedAt: daysAgo(0) }, now)).toBe('1 card · pasted list');
  });
});

describe('matchesSearch', () => {
  const deck = { name: 'Vampires', commanders: ['Vona, Butcher of Magan'] };
  it('finds a Deck by its name or a commander, in any case', () => {
    expect(matchesSearch(deck, 'vamp')).toBe(true);
    expect(matchesSearch(deck, 'BUTCHER')).toBe(true);
    expect(matchesSearch(deck, '  ')).toBe(true);
    expect(matchesSearch(deck, 'goblin')).toBe(false);
  });
});

describe('nameFromList', () => {
  it("takes the commander's name, partners joined, front faces only", () => {
    expect(nameFromList('Commander\n1 Vona, Butcher of Magan\nDeck\n1 Sol Ring')).toBe('Vona, Butcher of Magan');
    expect(nameFromList('1x Thrasios, Triton Hero [Commander]\n1x Tymna the Weaver [Commander]')).toBe(
      'Thrasios, Triton Hero & Tymna the Weaver',
    );
    expect(nameFromList('1 Sol Ring')).toBe('');
  });
});

describe('lineCount', () => {
  it('counts the lines that are not blank', () => {
    expect(lineCount('Commander\n1 Vona\n\n1 Sol Ring\n  \n')).toBe(3);
  });
});
