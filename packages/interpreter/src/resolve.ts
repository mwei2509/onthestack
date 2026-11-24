import {
  nextStackItemId,
  replayTurn,
  STEPS,
  type GameAction,
  type GameState,
  type ObjectId,
  type Permanent,
  type PlayerId,
  type Recipient as EngineRecipient,
  type TimelineEntry as EngineTimelineEntry,
} from '@onthestack/engine';
import type { CardRef, InterpretedGameAction, InterpretedQuestion, InterpretedTimeline, TimelineEntry } from './schema.js';

export interface ResolvedTimeline {
  timeline: EngineTimelineEntry[];
  questions: InterpretedQuestion[];
}

/** A GameAction recorded by a tap on the board, kept on every re-read (ADR 0065). */
export interface PinnedEntry {
  entry: EngineTimelineEntry;
  /** How many of the turn's statements had been made when it was tapped: where it falls in the conversation. */
  afterStatements: number;
}

export interface ResolveOptions {
  /** Tapped entries to place among the interpreted ones (ADR 0065). */
  pinned?: PinnedEntry[];
  /** The turn's statement ids in the order they were made, to tell which statements came before a tap. */
  statementIds?: string[];
}

type Item = { interpreted: TimelineEntry } | { pinned: EngineTimelineEntry };

/** What an action needs of the object it names, used to pick between copies before asking (ADR 0044). */
interface Need {
  untapped?: boolean;
  tapped?: boolean;
  attacking?: boolean;
  controller?: PlayerId;
}

class Unresolved extends Error {
  constructor(readonly question: InterpretedQuestion) {
    super(question.text);
  }
}

/**
 * Turns the interpreter's name-based timeline into engine timeline entries (ADR 0038). Each entry is resolved
 * against the board as it stands just before that entry, by replaying the entries resolved so far. An entry that
 * names something missing or genuinely ambiguous is left out and becomes a PlayerQuestion to its player.
 * Tapped entries are placed among them (`mergePinned`) and kept as they are.
 */
export function resolveTimeline(turnStart: GameState, read: InterpretedTimeline, options: ResolveOptions = {}): ResolvedTimeline {
  const interpreted = withPlayerIds(turnStart, read);
  const timeline: EngineTimelineEntry[] = [];
  const questions = [...interpreted.questions];

  for (const item of mergePinned(interpreted.entries, options)) {
    if ('pinned' in item) {
      timeline.push(item.pinned);
      continue;
    }
    const entry = item.interpreted;
    const { state } = replayTurn(turnStart, timeline, { currentStep: entry.step, responsePending: entry.response === true });
    try {
      const gameAction = new Resolver(state, entry).action(entry.action);
      timeline.push({ step: entry.step, playerId: entry.player, gameAction, from: entry.from, ...(entry.response ? { response: true } : {}) });
    } catch (e) {
      if (!(e instanceof Unresolved)) throw e;
      if (!questions.some((q) => sameQuestion(q, e.question))) questions.push(e.question);
    }
  }
  return { timeline, questions };
}

const PLAYER_FIELDS = new Set(['player', 'controller', 'target', 'askPlayer']);

/**
 * The interpreter is asked for player ids but sometimes writes a player's name ("melissa" for p1). A name that
 * belongs to exactly one player means that player; any other unknown value is left for `player()` to ask about.
 */
function withPlayerIds<T>(state: GameState, value: T): T {
  const byName = (name: string): PlayerId | undefined => {
    if (state.players[name]) return undefined;
    const matches = Object.values(state.players).filter((p) => sameName(p.name, name));
    return matches.length === 1 ? matches[0]!.id : undefined;
  };
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, PLAYER_FIELDS.has(k) && typeof x === 'string' ? (byName(x) ?? x) : walk(x)]),
    );
  };
  return walk(value) as T;
}

/**
 * Interpreted entries in Step order, keeping the interpreter's order within a Step, with each tapped entry placed
 * in the Step it was tapped in, before the first interpreted entry that came from a later statement (ADR 0065).
 */
function mergePinned(entries: TimelineEntry[], { pinned = [], statementIds = [] }: ResolveOptions): Item[] {
  const position = new Map(statementIds.map((id, i) => [id, i + 1]));
  const madeAt = (e: TimelineEntry) => Math.max(...e.from.map((id) => position.get(id) ?? statementIds.length));
  const step = (s: EngineTimelineEntry['step']) => STEPS.indexOf(s);
  const ordered = [...entries].sort((a, b) => step(a.step) - step(b.step));
  const taps = [...pinned].sort((a, b) => step(a.entry.step) - step(b.entry.step) || a.afterStatements - b.afterStatements);

  const items: Item[] = [];
  for (const e of ordered) {
    while (taps[0] && (step(taps[0].entry.step) < step(e.step) || (taps[0].entry.step === e.step && taps[0].afterStatements < madeAt(e)))) {
      items.push({ pinned: taps.shift()!.entry });
    }
    items.push({ interpreted: e });
  }
  return [...items, ...taps.map((t) => ({ pinned: t.entry }))];
}

const sameQuestion = (a: InterpretedQuestion, b: InterpretedQuestion) =>
  a.kind === b.kind && a.askPlayer === b.askPlayer && [...a.about].sort().join() === [...b.about].sort().join();

class Resolver {
  /** Objects already named in this action, so "two Zombies attack" names two different Zombies. A spell's effects name its targets again, so each effect starts fresh. */
  private used = new Set<ObjectId>();

  constructor(
    private state: GameState,
    private entry: TimelineEntry,
    /** While resolving a spell's effects: the spell itself, which is a damage source but not yet on the Stack. */
    private self?: { card: string; id: ObjectId },
  ) {}

  action(a: InterpretedGameAction): GameAction {
    const me = this.entry.player;
    switch (a.type) {
      case 'cast':
        return {
          type: 'cast',
          card: a.card,
          ...(a.targets ? { targets: a.targets.map((t) => this.target(t)) } : {}),
          ...(a.effects ? { effects: a.effects.map((e) => new Resolver(this.state, this.entry, { card: a.card, id: nextStackItemId(this.state) }).action(e)) } : {}),
        };
      case 'counter':
        return { type: 'counter', stackItemId: this.spell(a.spell) };
      case 'playLand':
        return a;
      case 'move':
        return { type: 'move', objectId: this.permanent(a.object), to: a.to, ...(a.how ? { how: a.how } : {}) };
      case 'tap':
        return { type: 'tap', permanentId: this.permanent(a.object, { untapped: true }) };
      case 'untap':
        return { type: 'untap', permanentId: this.permanent(a.object, { tapped: true }) };
      case 'gainControl':
        return { type: 'gainControl', permanentId: this.permanent(a.object), ...(a.until ? { until: a.until } : {}) };
      case 'counters':
        return { type: 'counters', target: this.recipient(a.target), kind: a.kind, delta: a.delta };
      case 'modify':
        return {
          type: 'modify',
          permanentId: this.permanent(a.object),
          power: a.power,
          toughness: a.toughness,
          ...(a.keywords ? { keywords: a.keywords } : {}),
          until: a.until,
        };
      case 'createToken':
        return a;
      case 'life':
        return { type: 'life', playerId: this.player(a.player), delta: a.delta };
      case 'damage':
        return {
          type: 'damage',
          sourceId: this.self && sameName(a.source.card, this.self.card) ? this.self.id : this.permanent(a.source),
          recipient: this.recipient(a.recipient),
          amount: a.amount,
        };
      case 'attack':
        return {
          type: 'attack',
          attacks: a.attacks.map((x) => ({ attackerId: this.permanent(x.attacker, { untapped: true, controller: me }), target: this.player(x.target) })),
        };
      case 'block':
        return {
          type: 'block',
          blocks: a.blocks.map((x) => ({
            blockerId: this.permanent(x.blocker, { untapped: true, controller: me }),
            attackerId: this.permanent(x.attacker, { attacking: true }),
          })),
        };
      case 'noBlock':
      case 'doneAttacking':
        return a;
      case 'divideDamage': {
        const attackerId = this.permanent(a.attacker, { attacking: true });
        const split: Record<string, number> = {};
        for (const s of a.split) {
          const r = this.recipient(s.to);
          const key = 'playerId' in r ? r.playerId : r.permanentId;
          split[key] = (split[key] ?? 0) + s.amount;
        }
        return { type: 'divideDamage', attackerId, split };
      }
      case 'playerTask':
        return { type: 'playerTask', playerId: this.player(a.player), text: a.text };
    }
  }

  private player(id: PlayerId): PlayerId {
    if (this.state.players[id]) return id;
    throw this.ask('choosePlayers', `Who is "${id}"?`);
  }

  private recipient(r: { player: PlayerId } | CardRef): EngineRecipient {
    return 'player' in r ? { playerId: this.player(r.player) } : { permanentId: this.permanent(r) };
  }

  /** A spell or ability target: a player, a permanent, or a spell on the Stack. */
  private target(r: { player: PlayerId } | CardRef): ObjectId {
    if ('player' in r) return this.player(r.player);
    if (this.permanentsNamed(r).length === 0 && this.spellsNamed(r).length > 0) return this.spell(r);
    return this.permanent(r);
  }

  private spellsNamed(ref: CardRef) {
    return this.state.stack.filter(
      (k) => k.kind === 'spell' && k.status === 'pending' && sameName(k.source.card, ref.card) && (!ref.controller || k.controllerId === ref.controller),
    );
  }

  private spell(ref: CardRef): ObjectId {
    const candidates = this.spellsNamed(ref).filter((k) => !this.used.has(k.id));
    const top = candidates.at(-1);
    if (!top) throw this.ask('chooseObjects', `I don't see ${ref.card} on the Stack. Which spell did you mean?`);
    this.used.add(top.id);
    return top.id;
  }

  private permanentsNamed(ref: CardRef): Permanent[] {
    return Object.values(this.state.permanents).filter((p) => sameName(p.card, ref.card) && (!ref.controller || p.controllerId === ref.controller));
  }

  private permanent(ref: CardRef, need: Need = {}): ObjectId {
    const named = this.permanentsNamed(ref).filter((p) => !this.used.has(p.id));
    if (named.length === 0) {
      const whose = ref.controller ? ` controlled by ${this.state.players[ref.controller]?.name ?? ref.controller}` : '';
      throw this.ask('chooseObjects', `I don't see ${ref.card}${whose} on the board. Which card did you mean?`);
    }
    const fitting = named.filter((p) => fits(p, need, this.state));
    const pool = fitting.length > 0 ? fitting : named;
    const kinds = new Set(pool.map(sameness));
    if (kinds.size > 1) throw this.ask('chooseObjects', `Which ${ref.card}?`);
    const chosen = pool.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))[0] as Permanent;
    this.used.add(chosen.id);
    return chosen.id;
  }

  private ask(kind: InterpretedQuestion['kind'], text: string): Unresolved {
    return new Unresolved({ kind, askPlayer: this.entry.player, text, about: this.entry.from });
  }
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

function fits(p: Permanent, need: Need, state: GameState): boolean {
  if (need.untapped && p.tapped) return false;
  if (need.tapped && !p.tapped) return false;
  if (need.controller && p.controllerId !== need.controller) return false;
  if (need.attacking && !state.combat?.attacks.some((a) => a.attackerId === p.id)) return false;
  return true;
}

/** Copies that agree on everything a player could tell apart are interchangeable (ADR 0038). */
function sameness(p: Permanent): string {
  return canonical(Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'id')));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
