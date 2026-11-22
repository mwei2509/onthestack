import type { Attack, Block } from './actions.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import type { DamageItem, GameEvent } from './events.js';
import type { PermanentId, PlayerId } from './ids.js';
import type { GameState, Permanent } from './state.js';
import { stats } from './stats.js';
import type { RulesWarning } from './warnings.js';

export type DamageStep = 'firstStrikeDamage' | 'combatDamage';

export interface CombatResult {
  state: GameState;
  events: GameEvent[];
  warnings: RulesWarning[];
}

const has = (p: Permanent, state: GameState, keyword: string) => stats(p, state).keywords.includes(keyword);

/** A creature can attack only if its controller has controlled it continuously since their turn began, or it has haste (CR 302.6). */
export const summoningSick = (p: Permanent, state: GameState): boolean => p.controlledSince >= state.turn.number && !has(p, state, 'Haste');

export function attackWarnings(state: GameState, attacks: Attack[], playerId: PlayerId): RulesWarning[] {
  const warnings: RulesWarning[] = [];
  for (const a of attacks) {
    const p = state.permanents[a.attackerId];
    if (!p) {
      warnings.push({ code: 'notOnBattlefield', message: `${a.attackerId} isn't on the battlefield.`, objectIds: [a.attackerId] });
      continue;
    }
    if (!stats(p, state).isCreature) warnings.push({ code: 'notACreature', message: `${p.card} isn't a creature.`, objectIds: [p.id] });
    if (p.controllerId !== playerId) warnings.push({ code: 'notYours', message: `${p.card} is controlled by someone else.`, objectIds: [p.id] });
    if (p.tapped) warnings.push({ code: 'tapped', message: `${p.card} is tapped.`, objectIds: [p.id] });
    if (summoningSick(p, state)) warnings.push({ code: 'summoningSickness', message: `${p.card} has summoning sickness.`, objectIds: [p.id] });
    const target = state.players[a.target];
    if (!target || target.out || a.target === playerId) warnings.push({ code: 'notAnOpponent', message: `${p.card} is attacking someone who isn't an opponent in the game.`, objectIds: [p.id] });
  }
  return warnings;
}

export function blockWarnings(state: GameState, blocks: Block[], defenderId: PlayerId): RulesWarning[] {
  const warnings: RulesWarning[] = [];
  const attacks = state.combat?.attacks ?? [];
  for (const b of blocks) {
    const blocker = state.permanents[b.blockerId];
    const attacker = state.permanents[b.attackerId];
    if (!blocker || !attacker) {
      const id = blocker ? b.attackerId : b.blockerId;
      warnings.push({ code: 'notOnBattlefield', message: `${id} isn't on the battlefield.`, objectIds: [id] });
      continue;
    }
    const attack = attacks.find((a) => a.attackerId === attacker.id);
    if (!attack) warnings.push({ code: 'notAttacking', message: `${attacker.card} isn't attacking.`, objectIds: [attacker.id] });
    else if (attack.target !== defenderId || blocker.controllerId !== defenderId) {
      warnings.push({ code: 'notTheDefender', message: `Only the player ${attacker.card} is attacking can block it.`, objectIds: [blocker.id, attacker.id] });
    }
    if (blocker.tapped) warnings.push({ code: 'tapped', message: `${blocker.card} is tapped.`, objectIds: [blocker.id] });
    if (has(attacker, state, 'Flying') && !has(blocker, state, 'Flying') && !has(blocker, state, 'Reach')) {
      warnings.push({ code: 'cantBlockFlyer', message: `${attacker.card} has flying; ${blocker.card} has neither flying nor reach.`, objectIds: [blocker.id, attacker.id] });
    }
  }
  for (const attackerId of new Set(blocks.map((b) => b.attackerId))) {
    const attacker = state.permanents[attackerId];
    const total = [...(state.combat?.blocks ?? []), ...blocks].filter((b) => b.attackerId === attackerId).length;
    if (attacker && total === 1 && has(attacker, state, 'Menace')) {
      warnings.push({ code: 'menace', message: `${attacker.card} has menace and needs two or more blockers.`, objectIds: [attackerId] });
    }
  }
  return warnings;
}

/** The first-strike damage step exists only if a creature in combat has first or double strike when damage begins (CR 510.4). */
export function firstStrikeStepNeeded(state: GameState): boolean {
  return inCombat(state).some((p) => has(p, state, 'First strike') || has(p, state, 'Double strike'));
}

function inCombat(state: GameState): Permanent[] {
  const ids = new Set([...(state.combat?.attacks ?? []).map((a) => a.attackerId), ...(state.combat?.blocks ?? []).map((b) => b.blockerId)]);
  return [...ids].map((id) => state.permanents[id]).filter((p): p is Permanent => p !== undefined);
}

/**
 * Creatures that dealt combat damage in this combat's first-strike damage step, read from this turn's GameEvents
 * (ADR 0032). The regular step asks this rather than current keywords: a creature that gains first strike after the
 * first-strike step still deals damage, and one that loses it doesn't deal damage again (CR 702.7c).
 */
export function dealtFirstStrikeDamage(state: GameState): Set<string> {
  const dealt = new Set<string>();
  let inFirstStrikeStep = false;
  for (const e of state.gameEventsThisTurn) {
    if (e.type === 'PhaseStarted') {
      if (e.step === 'beginningOfCombat') dealt.clear();
      inFirstStrikeStep = e.step === 'firstStrikeDamage';
    } else if (e.type === 'DamageDealt' && inFirstStrikeStep) {
      for (const d of e.damage) if (d.combat) dealt.add(d.sourceId);
    }
  }
  return dealt;
}

function dealsDamageIn(step: DamageStep, p: Permanent, state: GameState, dealtFirstStrike: Set<string>): boolean {
  const double = has(p, state, 'Double strike');
  if (step === 'firstStrikeDamage') return double || has(p, state, 'First strike');
  return double || !dealtFirstStrike.has(p.id);
}

/**
 * Deals one combat damage step (CR 510): every assignment is made against the same state and dealt as one batch,
 * so it's simultaneous. A blocked attacker divides its damage as its controller stated, or by default lethal to each
 * blocker in turn with the rest to the last blocker (or through, with trample). An attacker whose blockers are all
 * gone stays blocked and deals no damage unless it has trample.
 */
export function dealCombatDamage(state: GameState, step: DamageStep): CombatResult {
  const draft = clone(state);
  const dealtFirstStrike = step === 'combatDamage' ? dealtFirstStrikeDamage(draft) : new Set<string>();
  const events: GameEvent[] = [];
  const warnings: RulesWarning[] = [];
  const combat = draft.combat;
  if (!combat) return { state: draft, events, warnings };

  const damage: DamageItem[] = [];
  const add = (source: Permanent, recipient: DamageItem['recipient'], amount: number) => {
    if (amount > 0) damage.push({ sourceId: source.id, recipient, amount, combat: true, deathtouch: has(source, draft, 'Deathtouch') });
  };

  for (const attack of combat.attacks) {
    const attacker = draft.permanents[attack.attackerId];
    if (!attacker || !dealsDamageIn(step, attacker, draft, dealtFirstStrike)) continue;
    const power = Math.max(0, stats(attacker, draft).power);
    const wasBlocked = combat.blocks.some((b) => b.attackerId === attacker.id);
    const blockers = combat.blocks
      .filter((b) => b.attackerId === attacker.id)
      .map((b) => draft.permanents[b.blockerId])
      .filter((p): p is Permanent => p !== undefined);
    const trample = has(attacker, draft, 'Trample');

    if (!wasBlocked) {
      add(attacker, { playerId: attack.target }, power);
      continue;
    }
    if (blockers.length === 0) {
      if (trample) add(attacker, { playerId: attack.target }, power);
      continue;
    }
    const stated = combat.divisions[attacker.id];
    if (stated) {
      const total = Object.values(stated).reduce((n, x) => n + x, 0);
      if (total !== power) warnings.push({ code: 'divisionMismatch', message: `The damage stated for ${attacker.card} adds up to ${total}, but its power is ${power}.`, objectIds: [attacker.id] });
      for (const [to, amount] of Object.entries(stated)) add(attacker, draft.players[to] ? { playerId: to } : { permanentId: to }, amount);
      continue;
    }
    let remaining = power;
    blockers.forEach((b, i) => {
      const toughness = stats(b, draft).toughness;
      const lethal = has(attacker, draft, 'Deathtouch') ? Math.min(1, Math.max(0, toughness - b.damage)) : Math.max(0, toughness - b.damage);
      const isLast = i === blockers.length - 1;
      const amount = isLast && !trample ? remaining : Math.min(remaining, lethal);
      add(attacker, { permanentId: b.id }, amount);
      remaining -= amount;
    });
    if (trample && remaining > 0) add(attacker, { playerId: attack.target }, remaining);
  }

  for (const block of combat.blocks) {
    const blocker = draft.permanents[block.blockerId];
    const attacker = draft.permanents[block.attackerId];
    if (!blocker || !attacker || !dealsDamageIn(step, blocker, draft, dealtFirstStrike)) continue;
    add(blocker, { permanentId: attacker.id }, Math.max(0, stats(blocker, draft).power));
  }

  if (damage.length === 0) return { state: draft, events, warnings };

  const sources = new Map(damage.map((d) => [d.sourceId, draft.permanents[d.sourceId]!]));
  const dealt = emit(draft, events, { type: 'DamageDealt', damage }, { rule: 'combatDamage' });

  const lossByPlayer = new Map<PlayerId, number>();
  for (const d of damage) if ('playerId' in d.recipient) lossByPlayer.set(d.recipient.playerId, (lossByPlayer.get(d.recipient.playerId) ?? 0) + d.amount);
  for (const [playerId, amount] of lossByPlayer) {
    const life = draft.players[playerId]!.life;
    emit(draft, events, { type: 'LifeChanged', playerId, delta: -amount, lifeAfter: life - amount, reason: 'damage' }, { gameEvent: dealt.id });
  }

  const gainByPlayer = new Map<PlayerId, number>();
  for (const d of damage) {
    const source = sources.get(d.sourceId as PermanentId);
    if (source && has(source, state, 'Lifelink')) gainByPlayer.set(source.controllerId, (gainByPlayer.get(source.controllerId) ?? 0) + d.amount);
  }
  for (const [playerId, amount] of gainByPlayer) {
    const life = draft.players[playerId]!.life;
    emit(draft, events, { type: 'LifeChanged', playerId, delta: amount, lifeAfter: life + amount, reason: 'gain' }, { gameEvent: dealt.id });
  }

  return { state: draft, events, warnings };
}

/** End of combat: creatures stop attacking and blocking (CR 511.3). */
export function endCombat(state: GameState): CombatResult {
  const draft = clone(state);
  const events: GameEvent[] = [];
  if (draft.combat) emit(draft, events, { type: 'CombatEnded' }, { rule: 'turnStructure' });
  return { state: draft, events, warnings: [] };
}
