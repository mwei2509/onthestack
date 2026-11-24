import { describe, expect, it } from 'vitest';
import { describeAction, describeEntry, type Names } from './describe.js';

const names: Names = {
  player: (id) => ({ p1: 'Theo', p2: 'Elena' })[id] ?? id,
  object: (id) => ({ c1: 'Raging Goblin', c2: 'Grizzly Bears', k1: 'Shock' })[id] ?? 'a card that left',
};

describe('describing entries', () => {
  it('words life changes from the point of view of whoever changes', () => {
    expect(describeAction({ type: 'life', playerId: 'p2', delta: -3 }, 'p1', names)).toBe('Elena loses 3 life');
    expect(describeAction({ type: 'life', playerId: 'p1', delta: 1 }, 'p1', names)).toBe('Theo gains 1 life');
  });

  it('names cards, players and targets', () => {
    expect(describeAction({ type: 'cast', card: 'Shock', targets: ['c2'] }, 'p1', names)).toBe('Theo casts Shock targeting Grizzly Bears');
    expect(describeAction({ type: 'attack', attacks: [{ attackerId: 'c1', target: 'p2' }] }, 'p1', names)).toBe('Raging Goblin attacks Elena');
    expect(describeAction({ type: 'damage', sourceId: 'k1', recipient: { playerId: 'p2' }, amount: 2 }, 'p1', names)).toBe('Shock deals 2 damage to Elena');
    expect(describeAction({ type: 'move', objectId: 'c2', to: 'graveyard', how: 'destroy' }, 'p1', names)).toBe('Grizzly Bears is destroyed');
    expect(describeAction({ type: 'counters', target: { permanentId: 'c2' }, kind: '+1/+1', delta: 2 }, 'p1', names)).toBe('Grizzly Bears gets 2 +1/+1 counters');
    expect(describeAction({ type: 'createToken', token: 'Goblin', count: 3 }, 'p1', names)).toBe('Theo creates 3 Goblin tokens');
  });

  it('says the Step only when it is not where the table is', () => {
    const entry = { step: 'upkeep' as const, playerId: 'p1', gameAction: { type: 'noBlock' as const }, from: [] };
    expect(describeEntry(entry, names, 'upkeep')).toBe("Theo doesn't block");
    expect(describeEntry(entry, names, 'main1')).toBe("Theo doesn't block (Upkeep)");
  });
});
