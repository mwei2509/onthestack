import type { Named, NoteEffect, ReadbackNote, TimelineEntry } from '@onthestack/engine';
import { STEP_NAMES } from '../board/steps.js';
import type { Names } from './describe.js';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function who(n: Named, names: Names): string {
  return 'playerId' in n ? names.player(n.playerId) : (n.card ?? names.object(n.objectId));
}

function effectWords(e: NoteEffect, names: Names): string | null {
  switch (e.type) {
    case 'damage':
      return `${who(e.source, names)} dealt ${e.amount} to ${who(e.to, names)}`;
    case 'life':
      if (e.reason === 'damage') return null;
      return `${e.lifelink ? 'lifelink: ' : ''}${names.player(e.playerId)} ${e.delta < 0 ? 'loses' : 'gains'} ${Math.abs(e.delta)}`;
    case 'moved':
      if (e.from === 'battlefield' && e.to === 'graveyard') return null;
      if (e.to === 'battlefield') return e.isToken ? `${names.player(e.ownerId)} gets a ${e.card} token` : `${e.card} enters the battlefield`;
      if (e.to === 'exile') return `${e.card} is exiled`;
      if (e.to === 'command') return `${e.card} returns to the command zone`;
      if (e.to === 'hand') return `${e.card} returns to hand`;
      if (e.to === 'nowhere') return null;
      return `${e.card} goes to the ${e.to}`;
    case 'counters':
      return `${who(e.target, names)} ${e.delta < 0 ? 'loses' : 'gets'} ${plural(Math.abs(e.delta), `${e.kind} counter`)}`;
    case 'lost':
      return `${names.player(e.playerId)} loses the game`;
    case 'tapped':
      return `${who(e.target, names)} is ${e.tapped ? 'tapped' : 'untapped'}`;
    case 'control':
      return `${names.player(e.controllerId)} gains control of ${who(e.target, names)}`;
    case 'modified': {
      const pt = e.effect.power !== undefined || e.effect.toughness !== undefined;
      const sign = (n = 0) => (e.effect.kind === 'add' && n >= 0 ? `+${n}` : `${n}`);
      const keywords = e.effect.keywords?.length ? e.effect.keywords.join(', ') : '';
      return `${who(e.target, names)} ${e.effect.kind === 'add' ? 'gets' : 'becomes'} ${[pt ? `${sign(e.effect.power)}/${sign(e.effect.toughness)}` : '', keywords].filter(Boolean).join(' and ')}`;
    }
  }
}

/**
 * A readback note in words (ADR 0134): a combat note gets a line per attacker, with lifelink on the line when there's
 * only one, and deaths at the end; a Stack item's note is one line after its card and controller.
 */
export function describeNote(note: ReadbackNote, names: Names): string[] {
  const deaths = note.effects.flatMap((e) => (e.type === 'moved' && e.from === 'battlefield' && e.to === 'graveyard' ? [e.card] : []));
  const died = deaths.length ? [`Dies: ${deaths.join(', ')}`] : [];
  const words = (effects: NoteEffect[]) => effects.flatMap((e) => effectWords(e, names) ?? []);
  const c = note.cause;

  if ('stackItem' in c) {
    const head = `${c.card} (${names.player(c.controllerId)})`;
    if (c.status === 'fizzled') return [`${head}: did nothing, its targets are gone`];
    if (c.status === 'conditionNotMet') return [`${head}: did nothing, its condition wasn't met`];
    return [`${head}: ${[...words(note.effects), ...died].join(', ')}`];
  }

  if ('combatDamage' in c) {
    const bySource = new Map<string, string[]>();
    for (const e of note.effects) {
      if (e.type !== 'damage') continue;
      const source = who(e.source, names);
      bySource.set(source, [...(bySource.get(source) ?? []), `${e.amount} to ${who(e.to, names)}`]);
    }
    const lines = [...bySource].map(([source, hits]) => `${source} dealt ${hits.join(' and ')}`);
    const rest = words(note.effects.filter((e) => e.type !== 'damage'));
    const lifelink = rest.filter((l) => l.startsWith('lifelink: '));
    const others = rest.filter((l) => !l.startsWith('lifelink: '));
    if (lines.length === 1 && lifelink.length) lines[0] = [lines[0], ...lifelink].join(' · ');
    else lines.push(...lifelink.map((l) => `L${l.slice(1)}`));
    return [...lines, ...others, ...died];
  }

  const lines = words(note.effects).map((l) => l.charAt(0).toUpperCase() + l.slice(1));
  return [...lines, ...died];
}

/**
 * Places each note under the statement its entry is listed under: the last of the entry's statements, as entries
 * are (ADR 0136). Notes no current statement led to go at the top, with their Step.
 */
export function placeNotes(notes: ReadbackNote[], entries: TimelineEntry[], statementIds: string[]): { top: ReadbackNote[]; byStatement: Map<string, ReadbackNote[]> } {
  const order = new Map(statementIds.map((id, i) => [id, i]));
  const top: ReadbackNote[] = [];
  const byStatement = new Map<string, ReadbackNote[]>();
  for (const note of notes) {
    const first = 'playerStatement' in note.entry ? note.entry.playerStatement : undefined;
    const from = (entries.find((e) => e.from[0] === first)?.from ?? (first ? [first] : [])).filter((id) => order.has(id));
    if (from.length === 0) {
      top.push(note);
      continue;
    }
    const last = from.reduce((a, b) => (order.get(b)! > order.get(a)! ? b : a));
    byStatement.set(last, [...(byStatement.get(last) ?? []), note]);
  }
  return { top, byStatement };
}

/** The Step a note no statement led to is shown with. */
export const noteStep = (note: ReadbackNote): string | null => ('step' in note.entry ? STEP_NAMES[note.entry.step] : null);

/**
 * What makes two notes the same across re-reads (ADR 0136): their kind, card, entry and outcome. Object and Stack
 * item ids are left out, since they're numbered by replay position and shift when an earlier entry changes.
 */
export function noteKey(note: ReadbackNote): string {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'objectId' && k !== 'stackItem').map(([k, v]) => [k, strip(v)]));
    }
    return value;
  };
  return JSON.stringify(strip(note));
}

/** Each note's key, with an order number among identical notes, such as two Blood Artist triggers from one death. */
export function noteKeys(notes: ReadbackNote[]): string[] {
  const seen = new Map<string, number>();
  return notes.map((n) => {
    const key = noteKey(n);
    const i = seen.get(key) ?? 0;
    seen.set(key, i + 1);
    return `${key}#${i}`;
  });
}

/** The keys of notes that are new, or whose outcome changed, since `before` (ADR 0136). */
export function newNoteKeys(before: ReadbackNote[], now: ReadbackNote[]): string[] {
  const old = new Set(noteKeys(before));
  return noteKeys(now).filter((k) => !old.has(k));
}

/** Each player's net life change across these notes, leaving out players whose life didn't change. */
export function netLife(notes: ReadbackNote[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const n of notes) for (const e of n.effects) if (e.type === 'life') net[e.playerId] = (net[e.playerId] ?? 0) + e.delta;
  for (const [id, delta] of Object.entries(net)) if (delta === 0) delete net[id];
  return net;
}
