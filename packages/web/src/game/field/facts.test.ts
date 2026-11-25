import type { TableView } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { cardFacts, pileOf } from './facts.js';
import type { FieldGroup } from './layout.js';

const group = (over: Partial<FieldGroup> = {}): FieldGroup => ({
  key: 'k',
  card: 'Goblin Guide',
  ids: ['p1'],
  untapped: 1,
  tapped: 0,
  isToken: false,
  isCreature: true,
  power: 2,
  toughness: 2,
  ptVaries: false,
  keywords: [],
  counters: [],
  commander: false,
  ...over,
});

describe('cardFacts (ADR 0126, 0127)', () => {
  it('shows the printed power and toughness only when the engine differs', () => {
    expect(cardFacts(group(), { power: '2', toughness: '2' })[0]).toBe('2/2');
    expect(cardFacts(group({ power: 3, toughness: 3 }), { power: '2', toughness: '2' })[0]).toBe('3/3 now · printed 2/2');
  });

  it('spells out counters, copies, tapped and the commander', () => {
    const facts = cardFacts(group({ untapped: 2, tapped: 1, counters: [{ kind: '+1/+1', count: 2 }], keywords: ['Haste'], commander: true }));
    expect(facts).toEqual(['2/2', '2 +1/+1 counters', '3 on the battlefield, 1 tapped', 'Haste', 'Commander']);
  });

  it('gives a planeswalker its loyalty and no power or toughness', () => {
    expect(cardFacts(group({ isCreature: false, loyalty: 3, tapped: 0 }))).toEqual(['Loyalty 3', 'Untapped']);
  });
});

describe('pileOf', () => {
  const view = { graveyards: { p1: ['Bolt', 'Push'] }, exile: [{ card: 'Utvara Hellkite', ownerId: 'p1' }, { card: 'Other', ownerId: 'p2' }] } as unknown as TableView;

  it('lists the newest first', () => {
    expect(pileOf(view, 'p1', 'grave')).toEqual(['Push', 'Bolt']);
    expect(pileOf(view, 'p1', 'exile')).toEqual(['Utvara Hellkite']);
    expect(pileOf(view, 'p3', 'grave')).toEqual([]);
  });
});
