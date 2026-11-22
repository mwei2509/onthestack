import type { GameAction } from './actions.js';
import type { Cause, GameEvent, GameEventBody } from './events.js';
import type { PermanentId, PlayerId } from './ids.js';
import { clone } from './clone.js';
import { reduceInto } from './reduce.js';
import { hasKeyword } from './stats.js';
import { entersTappedBecause } from './triggers.js';
import { attackWarnings, blockWarnings } from './combat.js';
import type { GameState, Permanent } from './state.js';
import type { RulesWarning } from './warnings.js';

export const PERMANENT_TYPES = new Set(['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker']);

export interface ApplyContext {
  /** Who did it: the speaker for "I", or the player a statement named. */
  playerId: PlayerId;
  cause: Cause;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  warnings: RulesWarning[];
}

/** Turns one GameAction into GameEvents and folds them into a copy of the state. */
export function applyAction(state: GameState, action: GameAction, ctx: ApplyContext): ApplyResult {
  const draft = clone(state);
  const events: GameEvent[] = [];
  const warnings: RulesWarning[] = [];

  const emit = (body: GameEventBody, causedBy: Cause = ctx.cause): GameEvent => {
    const event = { ...body, id: `e${draft.nextIds.gameEvent++}`, causedBy } as GameEvent;
    reduceInto(draft, event);
    events.push(event);
    return event;
  };
  const newPermanentId = (): PermanentId => `p${draft.nextIds.permanent++}`;
  const permanent = (id: PermanentId): Permanent | undefined => {
    const p = draft.permanents[id];
    if (!p) warnings.push({ code: 'notOnBattlefield', message: `${id} isn't on the battlefield.`, objectIds: [id] });
    return p;
  };
  const player = (id: PlayerId): boolean => {
    if (draft.players[id]) return true;
    warnings.push({ code: 'unknownPlayer', message: `${id} isn't in this game.` });
    return false;
  };

  switch (action.type) {
    case 'playLand': {
      const def = draft.cards[action.card];
      if (def && !def.types.includes('Land')) {
        warnings.push({ code: 'notALand', message: `${action.card} isn't a land.` });
      }
      const because = entersTappedBecause(draft, action.card, ctx.playerId);
      emit({
        type: 'ZoneChanged',
        from: 'hand',
        to: 'battlefield',
        moves: [{ objectId: newPermanentId(), card: action.card, ownerId: ctx.playerId, controllerId: ctx.playerId, ...(because ? { tapped: true, entersTappedBecause: because } : {}) }],
      });
      break;
    }

    case 'cast': {
      const cz = draft.commandZone[ctx.playerId];
      const from = cz?.inZone && cz.card === action.card ? 'command' : 'hand';
      const stackItemId = `k${draft.nextIds.stackItem++}`;
      emit({ type: 'SpellCast', casterId: ctx.playerId, card: action.card, targets: action.targets ?? [], stackItemId, from, gameActions: action.effects ?? [] });
      if (!draft.cards[action.card]) {
        warnings.push({ code: 'unknownCard', message: `${action.card} isn't in this game's card list. Check the card.` });
      }
      break;
    }

    case 'counter': {
      const item = draft.stack.find((k) => k.id === action.stackItemId);
      if (!item) {
        warnings.push({ code: 'notOnStack', message: `${action.stackItemId} isn't on the stack.`, objectIds: [action.stackItemId] });
        break;
      }
      const countered = emit({ type: 'StackItemResolved', stackItemId: item.id, status: 'countered' });
      if (item.kind === 'spell') {
        emit(
          { type: 'ZoneChanged', from: 'stack', to: 'graveyard', how: 'countered', moves: [{ objectId: item.id, card: item.source.card, ownerId: item.controllerId }] },
          { gameEvent: countered.id },
        );
      }
      break;
    }

    case 'move': {
      const p = permanent(action.objectId);
      if (!p) break;
      emit({ type: 'ZoneChanged', from: 'battlefield', to: action.to, how: action.how, moves: [{ objectId: p.id, card: p.card, ownerId: p.ownerId, isToken: p.isToken }] });
      break;
    }

    case 'tap':
    case 'untap': {
      const p = permanent(action.permanentId);
      if (!p) break;
      emit({ type: 'TapChanged', permanentId: p.id, tapped: action.type === 'tap' });
      break;
    }

    case 'gainControl': {
      const p = permanent(action.permanentId);
      if (!p) break;
      emit({ type: 'ControlChanged', permanentId: p.id, controllerId: ctx.playerId, until: action.until });
      break;
    }

    case 'counters': {
      if ('permanentId' in action.target ? !permanent(action.target.permanentId) : !player(action.target.playerId)) break;
      emit({ type: 'CountersChanged', target: action.target, kind: action.kind, delta: action.delta });
      break;
    }

    case 'modify': {
      const p = permanent(action.permanentId);
      if (!p) break;
      emit({
        type: 'EffectAdded',
        permanentId: p.id,
        effect: { kind: 'add', power: action.power, toughness: action.toughness, keywords: action.keywords, until: action.until, timestamp: draft.nextIds.gameEvent },
      });
      break;
    }

    case 'createToken': {
      const ids = Array.from({ length: action.count }, newPermanentId);
      const because = entersTappedBecause(draft, action.token, ctx.playerId, action.definition?.types);
      emit({
        type: 'ZoneChanged',
        from: 'nowhere',
        to: 'battlefield',
        how: 'token',
        moves: ids.map((objectId) => ({
          objectId,
          card: action.token,
          ownerId: ctx.playerId,
          controllerId: ctx.playerId,
          isToken: true,
          tokenDefinition: action.definition,
          ...(because ? { tapped: true, entersTappedBecause: because } : {}),
        })),
      });
      break;
    }

    case 'life': {
      if (!player(action.playerId)) break;
      const life = draft.players[action.playerId]!.life;
      emit({ type: 'LifeChanged', playerId: action.playerId, delta: action.delta, lifeAfter: life + action.delta, reason: action.delta >= 0 ? 'gain' : 'loss' });
      break;
    }

    case 'damage': {
      if ('permanentId' in action.recipient ? !permanent(action.recipient.permanentId) : !player(action.recipient.playerId)) break;
      const source = draft.permanents[action.sourceId];
      const deathtouch = source ? hasKeyword(source, draft, 'Deathtouch') : false;
      const dealt = emit({ type: 'DamageDealt', damage: [{ sourceId: action.sourceId, recipient: action.recipient, amount: action.amount, combat: false, deathtouch }] });
      if ('playerId' in action.recipient) {
        const life = draft.players[action.recipient.playerId]!.life;
        emit(
          { type: 'LifeChanged', playerId: action.recipient.playerId, delta: -action.amount, lifeAfter: life - action.amount, reason: 'damage' },
          { gameEvent: dealt.id },
        );
      }
      if (source && action.amount > 0 && hasKeyword(source, draft, 'Lifelink')) {
        const gainer = draft.players[source.controllerId];
        if (gainer) {
          emit({ type: 'LifeChanged', playerId: gainer.id, delta: action.amount, lifeAfter: gainer.life + action.amount, reason: 'gain' }, { gameEvent: dealt.id });
        }
      }
      break;
    }

    case 'playerTask': {
      if (!player(action.playerId)) break;
      emit({ type: 'PlayerTaskCreated', playerId: action.playerId, text: action.text });
      break;
    }

    case 'attack': {
      warnings.push(...attackWarnings(draft, action.attacks, ctx.playerId));
      const attacks = action.attacks.filter((a) => draft.permanents[a.attackerId]);
      if (attacks.length === 0) break;
      const declared = emit({ type: 'AttackersDeclared', attacks });
      for (const a of attacks) {
        const p = draft.permanents[a.attackerId]!;
        if (!p.tapped && !hasKeyword(p, draft, 'Vigilance')) emit({ type: 'TapChanged', permanentId: p.id, tapped: true }, { gameEvent: declared.id });
      }
      break;
    }

    case 'block': {
      warnings.push(...blockWarnings(draft, action.blocks, ctx.playerId));
      const blocks = action.blocks.filter((b) => draft.permanents[b.blockerId] && draft.permanents[b.attackerId]);
      emit({ type: 'BlockersDeclared', defenderId: ctx.playerId, blocks });
      break;
    }

    case 'noBlock':
      if (!draft.combat?.attacks.length) {
        warnings.push({ code: 'notAttacking', message: 'Nothing is attacking right now.' });
        break;
      }
      emit({ type: 'BlockersDeclared', defenderId: ctx.playerId, blocks: [] });
      break;

    case 'doneAttacking':
      break;

    case 'divideDamage': {
      if (!permanent(action.attackerId)) break;
      emit({ type: 'DamageAssignmentSet', attackerId: action.attackerId, split: action.split });
      break;
    }
  }

  return { state: draft, events, warnings };
}
