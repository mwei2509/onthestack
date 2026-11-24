import { stats, STEPS, type CardName, type GameState, type PlayerStatement, type Step } from '@onthestack/engine';
import type { PinnedEntry } from './resolve.js';
import { QUESTION_KINDS } from './schema.js';

export interface PromptInput {
  /** The board when the turn began; the interpreter re-reads the whole turn from here (ADR 0015). */
  turnStart: GameState;
  /** Every PlayerStatement of the turn so far. */
  statements: PlayerStatement[];
  /** The Step the table is in now. */
  currentStep: Step;
  /** Oracle text by card name, where the app has it. */
  oracleText?: (card: CardName) => string | undefined;
  /** What players recorded by tapping on the board this turn; already in the record (ADR 0065). */
  pinned?: PinnedEntry[];
}

export interface Prompt {
  /** Identical for every request, so providers can cache it. */
  system: string;
  user: string;
  /** Names the system prompt's text, so a log line can say which one was sent without carrying it (ADR 0108). */
  version: string;
}

export function buildPrompt(input: PromptInput): Prompt {
  return { system: SYSTEM, user: userMessage(input), version: SYSTEM_VERSION };
}

const SYSTEM = `You keep the record for an in-person game of Magic: The Gathering Commander. Players hold a button and say what they do at the table. You read everything said this turn and return what happened, as an ordered list of literal GameActions, each placed in the Step where it happened.

You translate; you never calculate. Never work out damage, deaths, triggers or life totals yourself: a rules engine does that from your list. Only record what players said they did. If a player states an outcome ("the Spider dies"), record what they did that caused it, not the outcome.

Re-read the whole turn every time. Later statements can change earlier ones:
- Take-backs ("oops", "wait, no", "I didn't mean that", "actually it attacked Michael") change or remove what they refer to.
- Late statements ("back in my main phase I played a land", "I forgot my upkeep trigger") go in the Step they describe, unless the player says they do it now.
- Each statement has an id. List every statement an entry came from in its "from".
- Some actions were recorded by a tap on the board and are listed separately. They're already in the record: never add an entry for them, even when someone also says them ("that's the 3 I tapped off").

Steps, in order: ${STEPS.join(', ')}.
Timing words:
- "in response", "with that on the stack", "before that resolves": set "response": true. It goes right after what it answers, in the same Step.
- "before blocks": declareAttackers. "after blocks", "before damage": declareBlockers.
- "after first strike", "after first-strike damage": firstStrikeDamage. "after damage", "after combat": endOfCombat or main2.
- "end of turn", "at your end step": end.
- Combat damage happens on its own; never add damage entries for it. If a player says how a blocked attacker's damage is divided, use divideDamage in declareBlockers, since the division is decided before damage.
- A defending player who takes the hit or says "no blocks" is noBlock. "That's all my attackers" is doneAttacking.

Naming things:
- Refer to a card by its exact name from the board or the card list, with "controller" when more than one player has one. Use the name even for a card cast earlier this turn.
- Speech is transcribed, so names may be misheard ("Sarah Angel"). If a misheard name can only be one card in the game, use that card without asking. If it mixes two cards ("Savanna Angel": Savannah Lions or Serra Angel?), ask with chooseOption.
- Players are referred to by their id. "I" and "me" are the speaker; "you" is usually the player being addressed.
- A spell's effect happens when it resolves, so a cast carries its "effects", as the player stated them ("Murder on the Angel" carries a move to the graveyard with how: destroy).
- When a spell deals damage, the spell itself is the source: "Shock the Bears" carries damage with source Shock.

Never guess. If you can't tell what a player meant, leave out only that part, keep everything that is clear, and add a question:
- kinds: ${QUESTION_KINDS.join(', ')}.
- chooseOption: you aren't sure which card name was said; "options" lists the readings ("Serra Angel", "Savannah Lions").
- yesNo: something may or may not have happened. chooseObjects: which of several objects. choosePlayers: which player. chooseNumber: how many. whichStep: when it happened ("options" lists the Steps). tellHidden: something only that player can see, like a revealed card.
- Ask the player whose statement is unclear, quote what they said, and keep it short.
- Never suggest a play, list legal plays, or give strategy. Options may only be readings of what was said.
- Don't ask when the board or the conversation makes the meaning clear, and don't ask why a player did something: record life payments, sacrifices and other stated actions as said. Return only the questions still open: once a later statement answers one, drop it.

Return JSON only, matching the schema.`;

/** FNV-1a over the system prompt, in hex: short, stable across deploys while the text is unchanged. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const SYSTEM_VERSION = fnv1a(SYSTEM);

function userMessage({ turnStart, statements, currentStep, oracleText, pinned }: PromptInput): string {
  const sections = [
    `Turn ${turnStart.turn.number}. Active player: ${turnStart.turn.activePlayerId}. The table is now in: ${currentStep}.`,
    `Seats, in turn order:\n${turnStart.turnOrder.map((id) => seat(turnStart, id)).join('\n')}`,
    `Board when the turn began:\n${board(turnStart)}`,
    `Cards in this game:\n${cardList(turnStart, oracleText)}`,
    `What players said this turn, in order:\n${transcript(turnStart, statements)}`,
  ];
  if (pinned?.length) sections.push(`Already recorded by a tap on the board (never add these):\n${tapped(turnStart, statements, pinned)}`);
  return sections.join('\n\n');
}

function seat(state: GameState, id: string): string {
  const p = state.players[id];
  if (!p) return `- ${id}`;
  const commander = state.commandZone[id];
  const parts = [`life ${p.life}`];
  if (p.poison) parts.push(`poison ${p.poison}`);
  if (commander) parts.push(`commander ${commander.card}${commander.inZone ? ' (in the command zone)' : ''}`);
  if (p.out) parts.push('out of the game');
  return `- ${id}: ${p.name}, ${parts.join(', ')}`;
}

function board(state: GameState): string {
  const lines: string[] = [];
  for (const id of state.turnOrder) {
    const permanents = Object.values(state.permanents).filter((p) => p.controllerId === id);
    const graveyard = state.graveyards[id] ?? [];
    const exiled = state.exile.filter((e) => e.ownerId === id).map((e) => e.card);
    lines.push(`${id} controls:${permanents.length ? '' : ' nothing'}`);
    for (const p of permanents) {
      const s = stats(p, state);
      const notes = [
        s.isCreature ? `${s.power}/${s.toughness}` : null,
        s.keywords.length ? s.keywords.join(', ') : null,
        p.tapped ? 'tapped' : null,
        p.isToken ? 'token' : null,
        p.ownerId !== id ? `owned by ${p.ownerId}` : null,
        ...Object.entries(p.counters).map(([kind, count]) => `${count} ${kind} counter${count === 1 ? '' : 's'}`),
      ].filter(Boolean);
      lines.push(`  - ${p.card}${notes.length ? ` (${notes.join('; ')})` : ''}`);
    }
    if (graveyard.length) lines.push(`  graveyard: ${graveyard.join(', ')}`);
    if (exiled.length) lines.push(`  exile: ${exiled.join(', ')}`);
  }
  if (state.stack.length) lines.push(`Stack, top last: ${state.stack.map((k) => `${k.source.card} (${k.controllerId})`).join(', ')}`);
  return lines.join('\n');
}

function cardList(state: GameState, oracleText: PromptInput['oracleText']): string {
  const names = Object.keys(state.cards).sort();
  if (names.length === 0) return '(none known; use the names players say)';
  return names
    .map((name) => {
      const c = state.cards[name];
      const typeLine = c ? [c.types.join(' '), c.power !== undefined ? `${c.power}/${c.toughness}` : null, c.keywords?.length ? c.keywords.join(', ') : null].filter(Boolean).join('; ') : '';
      const text = oracleText?.(name);
      return `- ${name}: ${typeLine}${text ? `\n    ${text.replace(/\n/g, '\n    ')}` : ''}`;
    })
    .join('\n');
}

function transcript(state: GameState, statements: PlayerStatement[]): string {
  if (statements.length === 0) return '(nothing yet)';
  return [...statements]
    .sort((a, b) => a.pressedAt.localeCompare(b.pressedAt))
    .map((s) => `[${s.id}] ${state.players[s.playerId]?.name ?? s.playerId} (${s.playerId}): "${s.text}"`)
    .join('\n');
}

function tapped(state: GameState, statements: PlayerStatement[], pinned: PinnedEntry[]): string {
  const said = [...statements].sort((a, b) => a.pressedAt.localeCompare(b.pressedAt));
  return pinned
    .map(({ entry, afterStatements }) => {
      const when = afterStatements === 0 ? 'before anything was said' : `after [${said[afterStatements - 1]?.id ?? `s${afterStatements}`}]`;
      const who = state.players[entry.playerId]?.name ?? entry.playerId;
      const a = entry.gameAction;
      const what = a.type === 'life' ? `${a.playerId} ${a.delta > 0 ? 'gained' : 'lost'} ${Math.abs(a.delta)} life` : JSON.stringify(a);
      return `- ${what} (tapped by ${who}, ${when}, in ${entry.step})`;
    })
    .join('\n');
}
