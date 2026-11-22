import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import type { CardDefinition } from './cards.js';
import { dealCombatDamage, endCombat, firstStrikeStepNeeded } from './combat.js';
import type { GameEvent } from './events.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import { createGame } from './game.js';
import { settle } from './settle.js';
import { tableView } from './turn.js';
import type { GameState } from './state.js';

const creature = (name: string, power: number, toughness: number, keywords: string[] = []): CardDefinition => ({ name, types: ['Creature'], power, toughness, keywords, abilities: [] });
const cards: Record<string, CardDefinition> = {
  'Serra Angel': creature('Serra Angel', 4, 4, ['Flying', 'Vigilance']),
  'Grizzly Bears': creature('Grizzly Bears', 2, 2),
  'Raging Goblin': creature('Raging Goblin', 1, 1, ['Haste']),
  'Giant Spider': creature('Giant Spider', 2, 4, ['Reach']),
  'Boggart Brute': creature('Boggart Brute', 3, 2, ['Menace']),
  'Fencing Ace': creature('Fencing Ace', 1, 1, ['Double strike']),
  'Wall of Omens': creature('Wall of Omens', 0, 4, ['Defender']),
  'Hill Giant': creature('Hill Giant', 3, 3),
  'Colossal Dreadmaw': creature('Colossal Dreadmaw', 6, 6, ['Trample']),
  'Vampire Nighthawk': creature('Vampire Nighthawk', 2, 3, ['Deathtouch', 'Flying', 'Lifelink']),
  'Teysa Karlov': { ...creature('Teysa Karlov', 2, 4), legendary: true },
};

/** A board where every creature has been under its controller's control since an earlier turn. */
function board(entries: [string, string][]): GameState {
  let state = createGame(
    [{ id: 'theo', name: 'Theo', commander: 'Teysa Karlov' }, { id: 'michael', name: 'Michael' }, { id: 'melissa', name: 'Melissa' }],
    cards,
  );
  for (const [card, playerId] of entries) state = settle(applyAction(state, { type: 'cast', card }, { playerId, cause: { playerStatement: 's0' } }).state).state;
  state.turn = { number: 5, activePlayerId: 'theo', step: 'declareAttackers' };
  return state;
}

function act(state: GameState, steps: [GameAction, string][]) {
  const events: GameEvent[] = [];
  const warnings = [];
  for (const [action, playerId] of steps) {
    const r = applyAction(state, action, { playerId, cause: { playerStatement: 's1' } });
    state = r.state;
    events.push(...r.events);
    warnings.push(...r.warnings);
  }
  return { state, events, warnings };
}

/** Runs the damage steps the way the turn would: first strike if needed, settling after each. */
function damage(state: GameState) {
  const events: GameEvent[] = [];
  const warnings = [];
  const startStep = (s: GameState, step: 'firstStrikeDamage' | 'combatDamage') => {
    emit(s, [], { type: 'PhaseStarted', step, activePlayerId: s.turn.activePlayerId, turn: s.turn.number }, { rule: 'turnStructure' });
    return s;
  };
  const first = firstStrikeStepNeeded(state);
  if (first) {
    const r = dealCombatDamage(startStep(clone(state), 'firstStrikeDamage'), 'firstStrikeDamage');
    const s = settle(r.state);
    state = s.state;
    events.push(...r.events, ...s.events);
    warnings.push(...r.warnings);
  }
  const r = dealCombatDamage(startStep(clone(state), 'combatDamage'), 'combatDamage');
  const s = settle(r.state);
  events.push(...r.events, ...s.events);
  warnings.push(...r.warnings);
  return { state: s.state, events, warnings };
}

const withStep = (s: GameState, step: 'firstStrikeDamage' | 'combatDamage') => {
  const draft = clone(s);
  emit(draft, [], { type: 'PhaseStarted', step, activePlayerId: draft.turn.activePlayerId, turn: draft.turn.number }, { rule: 'turnStructure' });
  return draft;
};

const life = (s: GameState) => Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, p.life]));

describe('declaring attackers', () => {
  it('declares every attacker in one batch and taps those without vigilance', () => {
    const s = board([['Serra Angel', 'theo'], ['Grizzly Bears', 'theo']]);
    const { state, events, warnings } = act(s, [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }, { attackerId: 'p2', target: 'melissa' }] }, 'theo']]);
    expect(events.map((e) => e.type)).toEqual(['AttackersDeclared', 'TapChanged']);
    expect([state.permanents.p1!.tapped, state.permanents.p2!.tapped]).toEqual([false, true]);
    expect(warnings).toEqual([]);
  });

  it('flags summoning sickness by control, not by entering; haste is fine', () => {
    const s = board([]);
    const cast = (card: string) => settle(applyAction(s, { type: 'cast', card }, { playerId: 'theo', cause: { playerStatement: 's0' } }).state).state;
    expect(act(cast('Grizzly Bears'), [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo']]).warnings).toMatchObject([{ code: 'summoningSickness' }]);
    expect(act(cast('Raging Goblin'), [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo']]).warnings).toEqual([]);
  });

  it('still records an attack it flags: flag, don’t block', () => {
    const s = board([['Grizzly Bears', 'theo']]);
    s.permanents.p1!.tapped = true;
    const { state, warnings } = act(s, [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo']]);
    expect(warnings).toMatchObject([{ code: 'tapped' }]);
    expect(state.combat!.attacks).toEqual([{ attackerId: 'p1', target: 'michael' }]);
  });
});

describe('declaring blockers', () => {
  it('the issue #10 take-back case: a non-flyer blocking a flyer gets a RulesWarning from the engine', () => {
    const s = board([['Serra Angel', 'theo'], ['Grizzly Bears', 'michael']]);
    const { warnings } = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }] }, 'michael'],
    ]);
    expect(warnings).toMatchObject([{ code: 'cantBlockFlyer' }]);
  });

  it('reach can block a flyer; only the attacked player can block; a lone menace block is not a warning yet', () => {
    const s = board([['Serra Angel', 'theo'], ['Boggart Brute', 'theo'], ['Giant Spider', 'michael'], ['Grizzly Bears', 'melissa']]);
    const { warnings, state } = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }, { attackerId: 'p2', target: 'michael' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p3', attackerId: 'p2' }] }, 'michael'],
      [{ type: 'block', blocks: [{ blockerId: 'p4', attackerId: 'p1' }] }, 'melissa'],
    ]);
    expect(warnings.map((w) => w.code)).toEqual(['notTheDefender', 'cantBlockFlyer']);
    expect(state.combat!.ready).toEqual(['michael', 'melissa']);
  });

  it('"no blocks" makes that defender Ready', () => {
    const s = board([['Grizzly Bears', 'theo']]);
    const { state } = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
      [{ type: 'noBlock' }, 'michael'],
    ]);
    expect(state.combat!.ready).toEqual(['michael']);
  });
});

describe('menace (ADR 0027)', () => {
  const view = (state: GameState) => tableView({ state, events: [], tableEvents: [], warnings: [] });
  const oneBlock = () => {
    const s = board([['Boggart Brute', 'theo'], ['Grizzly Bears', 'michael'], ['Hill Giant', 'michael']]);
    return act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }] }, 'michael'],
    ]);
  };

  it('one blocker shows a reminder on the attacker, not a RulesWarning', () => {
    const { state, warnings } = oneBlock();
    expect(warnings).toEqual([]);
    expect(view(state).reminders).toEqual([{ text: 'Menace: needs another blocker', permanentId: 'p1' }]);
  });

  it('a second blocker clears the reminder', () => {
    const { state } = act(oneBlock().state, [[{ type: 'block', blocks: [{ blockerId: 'p3', attackerId: 'p1' }] }, 'michael']]);
    expect(view(state).reminders).toEqual([]);
  });

  it('damage starting with one blocker raises a RulesWarning offering "Go back", once', () => {
    const r = damage(oneBlock().state);
    expect(r.warnings).toEqual([{ code: 'menace', message: 'Boggart Brute has menace but only one blocker.', objectIds: ['p1'], goBack: true }]);
  });

  it('with a first-strike step, the warning still comes only once', () => {
    const s = oneBlock().state;
    s.permanents.p2!.effects.push({ kind: 'add', power: 0, toughness: 0, keywords: ['First strike'], until: 'endOfTurn', timestamp: 1 });
    expect(damage(s).warnings.filter((w) => w.code === 'menace')).toHaveLength(1);
  });
});

describe('combat damage', () => {
  it('unblocked damage goes to the attacked player and counts as commander damage from a commander', () => {
    const s = board([['Teysa Karlov', 'theo'], ['Grizzly Bears', 'theo']]);
    const declared = act(s, [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }, { attackerId: 'p2', target: 'melissa' }] }, 'theo']]).state;
    const { state, events } = damage(declared);
    expect(life(state)).toMatchObject({ michael: 38, melissa: 38 });
    expect(state.players.michael!.commanderDamage).toEqual({ 'Teysa Karlov': 2 });
    expect(state.players.melissa!.commanderDamage).toEqual({});
    expect(events.filter((e) => e.type === 'DamageDealt')).toHaveLength(1);
  });

  it('deathtouch kills a blocker with one damage, and lifelink gains its controller that much', () => {
    const s = board([['Vampire Nighthawk', 'theo'], ['Hill Giant', 'michael']]);
    const declared = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }] }, 'michael'],
    ]).state;
    const { state } = damage(declared);
    expect(state.permanents.p2).toBeUndefined();
    expect(state.permanents.p1).toBeUndefined();
    expect(life(state).theo).toBe(42);
  });

  it('by default: lethal to each blocker in turn, the rest to the last one, or through with trample', () => {
    const plain = board([['Hill Giant', 'theo'], ['Grizzly Bears', 'michael'], ['Grizzly Bears', 'michael']]);
    plain.permanents.p1!.effects.push({ kind: 'add', power: 2, toughness: 0, until: 'endOfTurn', timestamp: 1 });
    const blocked = (s: GameState) => act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }, { blockerId: 'p3', attackerId: 'p1' }] }, 'michael'],
    ]).state;
    const toBears = (r: { events: GameEvent[] }) => r.events.find((e) => e.type === 'DamageDealt' && e.damage.some((d) => d.sourceId === 'p1'));
    expect(toBears(dealCombatDamage(blocked(plain), 'combatDamage'))).toMatchObject({ damage: expect.arrayContaining([
      expect.objectContaining({ sourceId: 'p1', recipient: { permanentId: 'p2' }, amount: 2 }),
      expect.objectContaining({ sourceId: 'p1', recipient: { permanentId: 'p3' }, amount: 3 }),
    ]) });

    const trampler = board([['Colossal Dreadmaw', 'theo'], ['Grizzly Bears', 'michael'], ['Grizzly Bears', 'michael']]);
    const r = damage(blocked(trampler));
    expect(life(r.state).michael).toBe(38);
  });

  it('a stated division overrides the default, with a RulesWarning if it doesn’t add up', () => {
    const s = board([['Colossal Dreadmaw', 'theo'], ['Grizzly Bears', 'michael'], ['Giant Spider', 'michael']]);
    const declared = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }, { blockerId: 'p3', attackerId: 'p1' }] }, 'michael'],
      [{ type: 'divideDamage', attackerId: 'p1', split: { p2: 1, p3: 4 } }, 'theo'],
    ]).state;
    const r = damage(declared);
    expect(r.warnings).toMatchObject([{ code: 'divisionMismatch' }]);
    expect(r.state.permanents.p2).toBeDefined();
    expect(r.state.permanents.p3).toBeUndefined();
  });

  it('an attacker whose blocker is gone stays blocked: no damage, unless it has trample', () => {
    const run = (attacker: string) => {
      const s = board([[attacker, 'theo'], ['Grizzly Bears', 'michael']]);
      const declared = act(s, [
        [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo'],
        [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }] }, 'michael'],
        [{ type: 'move', objectId: 'p2', to: 'graveyard', how: 'destroy' }, 'melissa'],
      ]).state;
      return life(damage(declared).state).michael;
    };
    expect(run('Hill Giant')).toBe(40);
    expect(run('Colossal Dreadmaw')).toBe(34);
  });

  it('double strike deals damage in both steps (Fencing Ace into Wall of Omens)', () => {
    const s = board([['Fencing Ace', 'theo'], ['Wall of Omens', 'melissa']]);
    const declared = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'melissa' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }] }, 'melissa'],
    ]).state;
    expect(firstStrikeStepNeeded(declared)).toBe(true);
    const { state, events } = damage(declared);
    expect(events.filter((e) => e.type === 'DamageDealt')).toHaveLength(2);
    expect(state.permanents.p2!.damage).toBe(2);
  });

  it('a first striker kills its blocker before the blocker deals damage (Hill Giant with first strike)', () => {
    const s = board([['Hill Giant', 'theo'], ['Grizzly Bears', 'melissa']]);
    s.permanents.p1!.effects.push({ kind: 'add', power: 1, toughness: 0, keywords: ['First strike'], until: 'endOfTurn', timestamp: 1 });
    const declared = act(s, [
      [{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'melissa' }] }, 'theo'],
      [{ type: 'block', blocks: [{ blockerId: 'p2', attackerId: 'p1' }] }, 'melissa'],
    ]).state;
    const { state } = damage(declared);
    expect(state.permanents.p2).toBeUndefined();
    expect(state.permanents.p1!.damage).toBe(0);
  });

  it('a creature that loses first strike after dealing first-strike damage doesn’t deal damage again (CR 702.7c)', () => {
    const s = board([['Hill Giant', 'theo']]);
    s.permanents.p1!.effects.push({ kind: 'add', power: 0, toughness: 0, keywords: ['First strike'], until: 'endOfTurn', timestamp: 1 });
    const declared = act(s, [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'melissa' }] }, 'theo']]).state;
    const afterFirst = dealCombatDamage(withStep(declared, 'firstStrikeDamage'), 'firstStrikeDamage').state;
    expect(afterFirst.players.melissa!.life).toBe(37);
    afterFirst.permanents.p1!.effects = [];
    const afterRegular = dealCombatDamage(withStep(afterFirst, 'combatDamage'), 'combatDamage').state;
    expect(afterRegular.players.melissa!.life).toBe(37);
  });

  it('end of combat clears attackers and blockers', () => {
    const s = board([['Grizzly Bears', 'theo']]);
    const declared = act(s, [[{ type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] }, 'theo']]).state;
    expect(endCombat(declared).state.combat).toBeNull();
  });
});

const names = Object.keys(cards).filter((n) => n !== 'Teysa Karlov');
const scenario = fc.record({
  attackers: fc.array(fc.constantFrom(...names), { minLength: 1, maxLength: 4 }),
  blockers: fc.array(fc.constantFrom(...names), { maxLength: 4 }),
  pairing: fc.array(fc.nat(), { maxLength: 4 }),
});

describe('combat damage properties', () => {
  test.prop([scenario])('no attacker deals more than its power per step, and no damage amount is negative', ({ attackers, blockers, pairing }) => {
    const s = board([...attackers.map((c) => [c, 'theo'] as [string, string]), ...blockers.map((c) => [c, 'michael'] as [string, string])]);
    const attackerIds = attackers.map((_, i) => `p${i + 1}`);
    const blockerIds = blockers.map((_, i) => `p${attackers.length + i + 1}`);
    const declared = act(s, [
      [{ type: 'attack', attacks: attackerIds.map((id) => ({ attackerId: id, target: 'michael' })) }, 'theo'],
      [{ type: 'block', blocks: blockerIds.map((id, i) => ({ blockerId: id, attackerId: attackerIds[(pairing[i] ?? 0) % attackerIds.length]! })) }, 'michael'],
    ]).state;
    const { events } = damage(declared);
    for (const e of events) {
      if (e.type !== 'DamageDealt') continue;
      const bySource = new Map<string, number>();
      for (const d of e.damage) {
        expect(d.amount).toBeGreaterThan(0);
        bySource.set(d.sourceId, (bySource.get(d.sourceId) ?? 0) + d.amount);
      }
      for (const [sourceId, total] of bySource) {
        const card = declared.permanents[sourceId]?.card;
        if (card) expect(total).toBeLessThanOrEqual(cards[card]!.power!);
      }
    }
  });
});
