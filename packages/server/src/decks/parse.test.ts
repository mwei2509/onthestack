import { describe, expect, it } from 'vitest';
import { parseDeckList } from './parse.js';
import vona from './vona-archidekt.txt?raw';

describe("parsing Archidekt's text export", () => {
  const parsed = parseDeckList(vona);

  it('reads every line of a real 100-card Commander Deck', () => {
    expect(parsed.unreadable).toEqual([]);
    expect(parsed.lines).toHaveLength(80);
    expect(parsed.lines.reduce((n, l) => n + l.quantity, 0)).toBe(100);
  });

  it('takes the commander from its category, with its printing', () => {
    expect(parsed.lines.filter((l) => l.commander)).toEqual([
      {
        lineNumber: 78,
        text: '1x Vona, Butcher of Magan (lcc) 293 [Commander{top}]',
        quantity: 1,
        name: 'Vona, Butcher of Magan',
        set: 'lcc',
        collectorNumber: '293',
        commander: true,
      },
    ]);
  });

  it('keeps both faces of a double-faced card, and The List collector numbers', () => {
    expect(parsed.lines.find((l) => l.name.startsWith('Brightclimb'))).toMatchObject({
      name: 'Brightclimb Pathway // Grimclimb Pathway',
      set: 'plst',
      collectorNumber: 'ZNR-259',
    });
  });

  it('reads quantities above one', () => {
    expect(parsed.lines.find((l) => l.name === 'Plains')).toMatchObject({ quantity: 11, set: 'mdd' });
  });

  it('leaves out Maybeboard and Sideboard cards, and reads finish markers and labels', () => {
    const { lines } = parseDeckList(
      [
        '1x Sol Ring (c21) 263 *F* ^Have,#37d67a^ [Ramp]',
        '1x Lightning Greaves (c21) 245 [Maybeboard{noDeck}{noPrice}]',
        '1x Swords to Plowshares (c21) 101 [Sideboard]',
      ].join('\n'),
    );
    expect(lines.map((l) => [l.name, l.set, l.collectorNumber])).toEqual([['Sol Ring', 'c21', '263']]);
  });

  it('reads two Commander lines as partners', () => {
    const { lines } = parseDeckList(
      '1x Thrasios, Triton Hero (c16) 46 [Commander{top}]\n1x Tymna the Weaver (c16) 48 [Commander{top}]',
    );
    expect(lines.filter((l) => l.commander).map((l) => l.name)).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
  });
});

describe('parsing the one-card-per-line format', () => {
  it('takes the commander from a Commander heading', () => {
    const { lines, unreadable } = parseDeckList(
      ['Commander', '1 Vona, Butcher of Magan', '', 'Deck', '1 Sol Ring', '1x Arcane Signet', '10 Plains'].join('\n'),
    );
    expect(unreadable).toEqual([]);
    expect(lines.map((l) => [l.quantity, l.name, l.commander])).toEqual([
      [1, 'Vona, Butcher of Magan', true],
      [1, 'Sol Ring', false],
      [1, 'Arcane Signet', false],
      [10, 'Plains', false],
    ]);
  });

  it('accepts headings written with a colon or a leading //', () => {
    const { lines } = parseDeckList('// Commander\n1 Vona, Butcher of Magan\nMainboard:\n1 Sol Ring');
    expect(lines.map((l) => l.commander)).toEqual([true, false]);
  });

  it('leaves out cards under a Sideboard or Maybeboard heading', () => {
    const { lines } = parseDeckList('1 Sol Ring\nSideboard\n1 Lightning Greaves\nMaybeboard\n1 Swords to Plowshares');
    expect(lines.map((l) => l.name)).toEqual(['Sol Ring']);
  });

  it('reads a set and collector number when given', () => {
    const { lines } = parseDeckList('1 Sol Ring (C21) 263');
    expect(lines[0]).toMatchObject({ name: 'Sol Ring', set: 'c21', collectorNumber: '263' });
  });

  it('has no commander when nothing marks one', () => {
    const { lines } = parseDeckList('1 Vona, Butcher of Magan\n1 Sol Ring');
    expect(lines.some((l) => l.commander)).toBe(false);
  });
});

describe('lines it cannot read', () => {
  it('lists them with their line numbers, and keeps going', () => {
    const { lines, unreadable } = parseDeckList('1 Sol Ring\nSol Ring\nCompanion\n0 Plains\n\n2 Swamp');
    expect(unreadable).toEqual([
      { lineNumber: 2, text: 'Sol Ring' },
      { lineNumber: 3, text: 'Companion' },
      { lineNumber: 4, text: '0 Plains' },
    ]);
    expect(lines.map((l) => [l.lineNumber, l.name])).toEqual([
      [1, 'Sol Ring'],
      [6, 'Swamp'],
    ]);
  });
});
