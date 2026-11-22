import { describe, expect, it } from 'vitest';
import type { CardDefinition } from './cards.js';
import { scenario } from './scenario.js';

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
      effect: [{ gameAction: 'life', who: 'eachOpponent', delta: -1 }, { gameAction: 'life', who: 'you', delta: 1 }],
    }],
  },
};

const damage = (permanentId: string, amount: number) => ({ type: 'damage' as const, sourceId: 'spell', recipient: { permanentId }, amount });

// Ported from XMage (MIT; see THIRD_PARTY_NOTICES.md), commit 7fecba4e. Each test names its source.
describe('ported from XMage', () => {
  // Mage.Tests/src/test/java/org/mage/test/combat/FirstStrikeTest.java#firstStrikeGainedMidCombat (CR 702.7c)
  // Expected to fail until the first-strike fix (#31 step 2): a creature that gains first strike after the
  // first-strike damage step still deals damage in the regular step.
  it.fails('a creature that gains first strike after the first-strike step still deals regular damage', () => {
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
  // Expected to fail until the departing-player fix (#31 step 4): effects giving the departing player control end
  // first, so Wall of Air returns to A instead of being exiled.
  it.fails('when a player leaves, what they had taken returns to its previous controller', () => {
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
  // Expected to fail until simultaneous deaths are one GameEvent (#31 step 3, ADR 0026): Blood Artist dies at the
  // same moment as Grizzly Bears and should see both deaths.
  it.fails('Blood Artist dying alongside another creature sees both deaths (Pyroclasm)', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const artist = s.battlefield('A', 'Blood Artist');
    const bears = s.battlefield('A', 'Grizzly Bears');
    s.say(1, 'main1', 'A', { type: 'cast', card: 'Pyroclasm', effects: [damage(artist, 2), damage(bears, 2)] });
    const r = s.runUntil(1, 'end');
    expect([r.life('A'), r.life('B')]).toEqual([22, 18]);
  });
});
