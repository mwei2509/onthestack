import type { GameAction, Recipient, TableView, TimelineEntry } from '@onthestack/engine';
import { STEP_NAMES } from '../board/steps.js';

/** Who and what an entry names, in words: players by name, permanents by their card. */
export interface Names {
  player: (id: string) => string;
  object: (id: string) => string;
}

export function namesFor(view: TableView): Names {
  const cards = new Map(view.permanents.map((p) => [p.id, p.card]));
  for (const item of view.stack) cards.set(item.id, item.source.card);
  return {
    player: (id) => view.players[id]?.name ?? id,
    object: (id) => cards.get(id) ?? (view.players[id]?.name ?? 'a card that left'),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function recipient(r: Recipient, names: Names): string {
  return 'playerId' in r ? names.player(r.playerId) : names.object(r.permanentId);
}

/** A GameAction in plain words, said of the player who did it ("Elena loses 3 life", "Theo casts Shock"). */
export function describeAction(action: GameAction, by: string, names: Names): string {
  const who = names.player(by);
  switch (action.type) {
    case 'life':
      return `${names.player(action.playerId)} ${action.delta < 0 ? 'loses' : 'gains'} ${Math.abs(action.delta)} life`;
    case 'cast':
      return `${who} casts ${action.card}${action.targets?.length ? ` targeting ${action.targets.map((t) => names.object(t)).join(' and ')}` : ''}`;
    case 'playLand':
      return `${who} plays ${action.card}`;
    case 'counter':
      return `${who} counters ${names.object(action.stackItemId)}`;
    case 'move': {
      const card = names.object(action.objectId);
      const how = { destroy: 'is destroyed', sacrifice: 'is sacrificed', exile: 'is exiled', return: 'returns to hand' } as Record<string, string>;
      return action.how && how[action.how] ? `${card} ${how[action.how]}` : `${card} goes to ${action.to === 'battlefield' ? 'the battlefield' : `the ${action.to}`}`;
    }
    case 'tap':
      return `${names.object(action.permanentId)} is tapped`;
    case 'untap':
      return `${names.object(action.permanentId)} is untapped`;
    case 'gainControl':
      return `${who} gains control of ${names.object(action.permanentId)}${action.until === 'endOfTurn' ? ' until end of turn' : ''}`;
    case 'counters':
      return `${recipient(action.target, names)} ${action.delta < 0 ? 'loses' : 'gets'} ${plural(Math.abs(action.delta), `${action.kind} counter`)}`;
    case 'modify':
      return `${names.object(action.permanentId)} becomes ${action.power}/${action.toughness}${action.keywords?.length ? ` with ${action.keywords.join(', ')}` : ''} until end of turn`;
    case 'createToken':
      return `${who} creates ${action.count === 1 ? `a ${action.token}` : `${action.count} ${action.token}`} token${action.count === 1 ? '' : 's'}`;
    case 'damage':
      return `${names.object(action.sourceId)} deals ${action.amount} damage to ${recipient(action.recipient, names)}`;
    case 'attack':
      return action.attacks.map((a) => `${names.object(a.attackerId)} attacks ${names.player(a.target)}`).join('; ');
    case 'block':
      return action.blocks.map((b) => `${names.object(b.blockerId)} blocks ${names.object(b.attackerId)}`).join('; ');
    case 'noBlock':
      return `${who} doesn't block`;
    case 'doneAttacking':
      return `${who} is done attacking`;
    case 'divideDamage':
      return `${who} divides ${names.object(action.attackerId)}'s damage`;
    case 'playerTask':
      return `${names.player(action.playerId)}: ${action.text}`;
  }
}

/** An entry in words, with its Step when it isn't the one the table is in. */
export function describeEntry(entry: TimelineEntry, names: Names, currentStep?: TimelineEntry['step']): string {
  const words = describeAction(entry.gameAction, entry.playerId, names);
  return entry.step === currentStep ? words : `${words} (${STEP_NAMES[entry.step]})`;
}
