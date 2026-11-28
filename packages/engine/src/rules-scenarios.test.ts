import { describe, expect, it } from 'vitest';
import type { CardDefinition } from './cards.js';
import { scenario, type ScenarioResult } from './scenario.js';

const creature = (name: string, power: number, toughness: number, keywords: string[] = []): CardDefinition => ({ name, types: ['Creature'], power, toughness, keywords, abilities: [] });
const spell = (name: string, type: 'Instant' | 'Sorcery'): CardDefinition => ({ name, types: [type], abilities: [] });

const cards: Record<string, CardDefinition> = {
  'White Knight': creature('White Knight', 2, 2, ['First strike', 'Protection from black']),
  'Warpath Ghoul': creature('Warpath Ghoul', 3, 2),
  'Kindled Fury': spell('Kindled Fury', 'Instant'),
  'Grizzly Bears': creature('Grizzly Bears', 2, 2),
  'Bloodflow Connoisseur': creature('Bloodflow Connoisseur', 1, 1),
  'Lightning Bolt': spell('Lightning Bolt', 'Instant'),
  Pyroclasm: spell('Pyroclasm', 'Sorcery'),
  'Rootwater Commando': creature('Rootwater Commando', 2, 2, ['Islandwalk']),
  'Wall of Air': creature('Wall of Air', 1, 5, ['Defender', 'Flying']),
  'Silvercoat Lion': creature('Silvercoat Lion', 2, 2),
  Legerdemain: spell('Legerdemain', 'Sorcery'),
  // "Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life."
  // "Target player" is written as "each opponent", the same in a two-player game, until trigger targets
  // come from the conversation (ADR 0025).
  'Blood Artist': {
    ...creature('Blood Artist', 0, 1),
    abilities: [{
      id: 'blood-artist#1',
      kind: 'triggered',
      when: { event: 'ZoneChanged', from: 'battlefield', to: 'graveyard', object: { selfOr: { types: ['Creature'] } } },
      effect: [{ gameAction: 'life', who: 'eachOpponent', amount: 1, lose: true }, { gameAction: 'life', who: 'you', amount: 1 }],
    }],
  },
};

const combatCards: Record<string, CardDefinition> = {
  ...cards,
  'Fencing Ace': creature('Fencing Ace', 1, 1, ['Double strike']),
  // "Whenever Dimir Cutpurse deals combat damage to a player, that player discards a card and you draw a card."
  'Dimir Cutpurse': {
    ...creature('Dimir Cutpurse', 2, 2),
    abilities: [{
      id: 'dimir-cutpurse#1',
      kind: 'triggered',
      when: { event: 'DamageDealt', combat: true, object: 'self' },
      effect: [{ playerTask: 'Discard a card', who: 'defendingPlayer' }, { playerTask: 'Draw a card', who: 'you' }],
    }],
  },
  // "Whenever a creature you control deals combat damage to an opponent, you may draw a card."
  'Coastal Piracy': {
    name: 'Coastal Piracy',
    types: ['Enchantment'],
    abilities: [{
      id: 'coastal-piracy#1',
      kind: 'triggered',
      when: { event: 'DamageDealt', combat: true, player: 'opponent', object: { types: ['Creature'], controller: 'you' } },
      effect: [{ playerTask: 'You may draw a card', who: 'you' }],
    }],
  },
};

/** PlayerTasks that came from a card's ability, as "player: text". */
const tasks = (r: ScenarioResult) =>
  r.tableEvents.flatMap((e) => (e.type === 'PlayerTaskCreated' && 'stackItem' in e.causedBy ? [`${e.playerId}: ${e.text}`] : []));

const damage = (permanentId: string, amount: number) => ({ type: 'damage' as const, sourceId: 'spell', recipient: { permanentId }, amount });

// Ported from XMage (MIT; see THIRD_PARTY_NOTICES.md), commit 7fecba4e. Each test names its source.
describe('ported from XMage', () => {
  // Mage.Tests/src/test/java/org/mage/test/combat/FirstStrikeTest.java#firstStrikeGainedMidCombat (CR 702.7c)
  it('a creature that gains first strike after the first-strike step still deals regular damage', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const knight = s.battlefield('A', 'White Knight');
    const ghoul = s.battlefield('A', 'Warpath Ghoul');
    s.say(1, 'declareAttackers', 'A', { type: 'attack', attacks: [{ attackerId: knight, target: 'B' }, { attackerId: ghoul, target: 'B' }] });
    s.say(1, 'firstStrikeDamage', 'A', {
      type: 'cast', card: 'Kindled Fury', targets: [ghoul],
      effects: [{ type: 'modify', permanentId: ghoul, power: 1, toughness: 0, keywords: ['First strike'], until: 'endOfTurn' }],
    });
    expect(s.runUntil(1, 'main2').life('B')).toBe(14);
  });

  // Mage.Tests/src/test/java/org/mage/test/cards/triggers/dies/BloodArtistTest.java#testDisabledEffectOnChangeZone (CR 603.10a)
  it('a dying Blood Artist triggers for its own death, alongside the other Blood Artist', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const artist = s.battlefield('A', 'Blood Artist');
    s.battlefield('A', 'Blood Artist');
    const connoisseur = s.battlefield('B', 'Bloodflow Connoisseur');
    s.say(1, 'main1', 'A', { type: 'cast', card: 'Lightning Bolt', targets: [artist], effects: [damage(artist, 3)] });
    s.say(1, 'main2', 'A', { type: 'cast', card: 'Lightning Bolt', targets: [connoisseur], effects: [damage(connoisseur, 3)] });
    const r = s.runUntil(1, 'end');
    expect([r.life('A'), r.life('B')]).toEqual([23, 17]);
  });

  // Mage.Tests/src/test/java/org/mage/test/multiplayer/PlayerLeftGameRangeAllTest.java#TestControlledBySorcery (CR 800.4a)
  it('when a player leaves, what they had taken returns to its previous controller', () => {
    const s = scenario({ seats: ['A', 'D', 'C', 'B'], life: 2, cards });
    const commando = s.battlefield('C', 'Rootwater Commando');
    const wall = s.battlefield('A', 'Wall of Air');
    const lion = s.battlefield('D', 'Silvercoat Lion');
    // Legerdemain exchanges control of the two creatures. A GameAction can't yet name who gains control,
    // so its second half is said by C taking Wall of Air.
    s.say(1, 'main1', 'A', { type: 'cast', card: 'Legerdemain', targets: [commando, wall], effects: [{ type: 'gainControl', permanentId: commando }] });
    s.say(1, 'main1', 'C', { type: 'gainControl', permanentId: wall });
    s.say(2, 'declareAttackers', 'D', { type: 'attack', attacks: [{ attackerId: lion, target: 'C' }] });
    s.say(2, 'declareBlockers', 'C', { type: 'noBlock' });
    const r = s.runUntil(2, 'main2');
    expect(r.life('C')).toBe(0);
    expect(r.state.players.C!.out).toBe(true);
    expect(r.controls('C')).toEqual([]);
    expect(r.controls('A')).toEqual(['Wall of Air']);
    expect(r.graveyard('A')).toEqual(['Legerdemain']);
  });

  // Mage.Tests/src/test/java/org/mage/test/lki/LastKnownInformationTest.java#testPersistTriggersInTime (CR 608.2h)
  it.todo('Murder Investigation uses the creature’s last known power (needs richer last-known information, ADR 0032)');

  // Mage.Tests/src/test/java/org/mage/test/cards/replacement/DoublingSeasonTest.java#test_Counters_ByTrigger (CR 614, 616.1)
  it.todo('Doubling Season doubles counters put by a trigger (needs replacement effects, M3)');
});

describe('our own scenarios', () => {
  // ADR 0026: Blood Artist dies at the same moment as Grizzly Bears and sees both deaths.
  it('Blood Artist dying alongside another creature sees both deaths (Pyroclasm)', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const artist = s.battlefield('A', 'Blood Artist');
    const bears = s.battlefield('A', 'Grizzly Bears');
    s.say(1, 'main1', 'A', { type: 'cast', card: 'Pyroclasm', effects: [damage(artist, 2), damage(bears, 2)] });
    const r = s.runUntil(1, 'end');
    expect([r.life('A'), r.life('B')]).toEqual([22, 18]);
  });
});

describe('"deals combat damage to a player" triggers (#37)', () => {
  const attack = (attackerId: string, target = 'B') => ({ type: 'attack' as const, attacks: [{ attackerId, target }] });

  it('"whenever this deals combat damage to a player" triggers, and "that player" is the one dealt damage', () => {
    const s = scenario({ seats: ['A', 'B', 'C'], life: 20, cards: combatCards });
    const cutpurse = s.battlefield('A', 'Dimir Cutpurse');
    s.say(1, 'declareAttackers', 'A', attack(cutpurse, 'C'));
    s.say(1, 'declareBlockers', 'B', { type: 'noBlock' });
    s.say(1, 'declareBlockers', 'C', { type: 'noBlock' });
    expect(tasks(s.runUntil(1, 'main2'))).toEqual(['C: Dimir Cutpurse: Discard a card', 'A: Dimir Cutpurse: Draw a card']);
  });

  it('"whenever a creature you control deals combat damage to an opponent" triggers once per creature', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards: combatCards });
    s.battlefield('A', 'Coastal Piracy');
    const bears = s.battlefield('A', 'Grizzly Bears');
    const lion = s.battlefield('A', 'Silvercoat Lion');
    s.battlefield('B', 'Coastal Piracy');
    s.say(1, 'declareAttackers', 'A', { type: 'attack', attacks: [{ attackerId: bears, target: 'B' }, { attackerId: lion, target: 'B' }] });
    s.say(1, 'declareBlockers', 'B', { type: 'noBlock' });
    expect(tasks(s.runUntil(1, 'main2'))).toEqual(['A: Coastal Piracy: You may draw a card', 'A: Coastal Piracy: You may draw a card']);
  });

  it('damage to a blocking creature does not trigger it', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards: combatCards });
    const cutpurse = s.battlefield('A', 'Dimir Cutpurse');
    const bears = s.battlefield('B', 'Grizzly Bears');
    s.say(1, 'declareAttackers', 'A', attack(cutpurse));
    s.say(1, 'declareBlockers', 'B', { type: 'block', blocks: [{ blockerId: bears, attackerId: cutpurse }] });
    expect(tasks(s.runUntil(1, 'main2'))).toEqual([]);
  });

  it('noncombat damage to a player does not trigger it', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards: combatCards });
    const cutpurse = s.battlefield('A', 'Dimir Cutpurse');
    s.say(1, 'main1', 'A', { type: 'damage', sourceId: cutpurse, recipient: { playerId: 'B' }, amount: 2 });
    const r = s.runUntil(1, 'main2');
    expect(r.life('B')).toBe(18);
    expect(tasks(r)).toEqual([]);
  });

  it('double strike that connects in both damage steps triggers twice', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards: combatCards });
    s.battlefield('A', 'Coastal Piracy');
    const ace = s.battlefield('A', 'Fencing Ace');
    s.say(1, 'declareAttackers', 'A', attack(ace));
    s.say(1, 'declareBlockers', 'B', { type: 'noBlock' });
    const r = s.runUntil(1, 'main2');
    expect(r.life('B')).toBe(18);
    expect(tasks(r)).toHaveLength(2);
  });
});
