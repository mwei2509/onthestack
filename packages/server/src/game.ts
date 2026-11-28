import { DurableObject } from 'cloudflare:workers';
import { createGame, overrideMatches, replayTurn, sealTurn, STEPS, stepsAhead, tableView, taskDoneMatches, type GameState, type PlayerStatement, type PlayerTaskDone, type ReplayResult, type RulesWarning, type RulesWarningCode, type SealedTurn, type Step, type TableView, type TimelineEntry, type WarningOverride } from '@onthestack/engine';
import { buildPrompt, claudeProvider, interpretPrompt, LlmOutputError, resolveTimeline, type InterpretedTimeline, type LlmProvider, type PinnedEntry, type ResolvedTimeline } from '@onthestack/interpreter';
import { replaySummary } from './log.js';
import { fitDump } from './reports.js';
import { libraryDecks, type Deck, type DeckSource } from './decks.js';
import { claimJoinCode, retireJoinCode, touchJoinCode } from './joinCodes.js';
import type { GameDeck } from './decks/api.js';
import { versionCards } from './decks/store.js';
import { loadGameCards, NO_CARDS, withCards, withoutDeckCards, type GameCards } from './gameCards.js';
import { DeviceMessage, type GameSummary, type Ended, type InterpretationRecord, type ServerMessage, type StatementStatus, type TurnLog } from './protocol.js';

interface Seat {
  id: string;
  name: string;
  /** A summary of the seat's Deck, taken when it was picked (ADR 0085). Start reads the Deck afresh. */
  deck?: Deck;
}

/** What the lobby stores (ADR 0054). Which device holds which seat lives on the sockets, not here. */
interface Setup {
  code: string;
  createdAt: string;
  seats: Seat[];
  nextSeat: number;
  started: boolean;
  firstSeatId?: string;
  ended?: Ended;
  /** The six-digit code typed into Join game; null once retired (ADR 0095). */
  joinCode?: string | null;
  /** Each seat's Deck as it was at Start, with the version whose cards the game uses (ADR 0119). */
  decks?: Record<string, Deck>;
}

/** The current turn (ADR 0054, 0069, 0074). The board is never stored: it's this, replayed. Sealed turns have keys of their own. */
interface Turn {
  turnStart: GameState;
  /** What was tapped on the board, kept on every re-read and placed by when it was tapped (ADR 0065). */
  pinned: PinnedEntry[];
  currentStep: Step;
  /** The TurnTranscript, in the order statements arrived. */
  statements: PlayerStatement[];
  /** Rises with every change to the TurnTranscript, so a reading can say which one it read (ADR 0017). */
  transcriptVersion: number;
  /** The last InterpretedTimeline applied, and the transcript version it read. */
  reading?: { timeline: InterpretedTimeline; transcriptVersion: number };
  /** "Do it anyway" choices, passed to every replay of the turn (ADR 0123). */
  overrides: WarningOverride[];
  /** PlayerTasks marked done, passed to every replay of the turn (ADR 0125). */
  doneTasks: PlayerTaskDone[];
}

/** What a sealed turn's key holds: the engine's record plus the turn's TurnTranscript and the warnings it ended with. */
interface StoredSealedTurn extends SealedTurn {
  statements: PlayerStatement[];
  warnings: RulesWarning[];
}

/** Wait after a statement before interpreting, in case someone else is mid-sentence (ADR 0017). Tuned at game nights. */
const INTERPRET_AFTER_MS = 300;

/** Kept on each socket with serializeAttachment, so it survives the Durable Object hibernating. */
interface Attachment {
  seatId: string | null;
}

/** The debug panel's interpretations, kept apart from the turn so they never reach a Sealed turn (ADR 0109). */
const INTERPRETATIONS = 'interpretations';
const KEPT_INTERPRETATIONS = 10;

export const MAX_SEATS = 6;

const JOIN_CODE_TOUCH_MS = 10 * 60 * 1000;

class Rejected extends Error {}

export class Game extends DurableObject<Env> {
  private setup: Setup | null = null;
  private version = 0;
  /** When the join code's activity was last refreshed in D1; kept in memory, so a wake-up refreshes once more. */
  private joinCodeTouchedAt = 0;
  private turn: Turn | null = null;
  private board: ReplayResult | null = null;
  /** The frozen board of an ended game: its last sealed turn, never replayed again (ADR 0100). */
  private endedBoard: ReplayResult | null = null;
  /** The engine timeline the board was replayed from: the reading's entries resolved, with the taps among them. */
  private resolved: ResolvedTimeline = { timeline: [], questions: [] };
  private readonly decks: DeckSource;
  private interpreter: LlmProvider | undefined;
  private interpretAfterMs = INTERPRET_AFTER_MS;
  private interpreting = false;
  /** Between a statement and the request it leads to (ADR 0017's short wait). */
  private interpretWaiting = false;
  private interpretTimer: ReturnType<typeof setTimeout> | undefined;
  /** Rises on every restart, so a reading still in flight can't land on the restarted game (ADR 0145). */
  private restarts = 0;

  /** The Decks' cards, loaded from D1 when the game wakes and never stored here (ADR 0119). */
  private cards: GameCards = NO_CARDS;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.decks = libraryDecks(env.DB);
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<unknown>(['setup', 'version', 'turn']);
      this.setup = (stored.get('setup') as Setup | undefined) ?? null;
      this.version = (stored.get('version') as number | undefined) ?? 0;
      this.cards = await this.loadCards();
      const turn = loadTurn(stored.get('turn') as StoredTurn | undefined);
      this.turn = turn && { ...turn, turnStart: withCards(turn.turnStart, this.cards) };
      if (this.setup?.ended) {
        const last = await ctx.storage.get<StoredSealedTurn>(`sealed:${this.setup.ended.turn}`);
        if (last) this.endedBoard = { state: withCards(last.finalBoard, this.cards), events: [], tableEvents: [], warnings: last.warnings ?? [] };
      }
      this.replay();
    });
  }

  /** Called once by `POST /api/games`. Null if the code is already a game, so a new game never overwrites one. */
  async create(code: string, createdAt: string): Promise<{ joinCode: string | null } | null> {
    if (this.setup) return null;
    const joinCode = await claimJoinCode(this.env.DB, code, new Date(createdAt));
    this.setup = { code, createdAt, seats: [], nextSeat: 1, started: false, joinCode };
    this.joinCodeTouchedAt = Date.parse(createdAt);
    this.version = 1;
    await this.save();
    return { joinCode };
  }

  /** Where the game is, for `GET /api/games/<code>` and Home's Continue card (ADR 0111); null if there's no game. */
  async summary(): Promise<GameSummary | null> {
    if (!this.setup) return null;
    if (this.setup.ended) return { status: 'ended', turn: this.setup.ended.turn };
    if (this.turn) return { status: 'playing', turn: this.turn.turnStart.turn.number };
    return { status: 'lobby', turn: null };
  }

  /** Each seat's Deck as the version it brought, for `GET /api/games/<code>/cards` (ADR 0119, 0129); null if there's no game. */
  async gameDecks(): Promise<GameDeck[] | null> {
    if (!this.setup) return null;
    const decks = this.setup.decks ?? {};
    return Promise.all(
      Object.entries(decks).map(async ([seatId, deck]) => ({
        seatId,
        deckId: deck.id,
        name: deck.name,
        colorIdentity: deck.colorIdentity,
        cards: deck.versionId ? await versionCards(this.env.DB, deck.versionId) : [],
      })),
    );
  }

  /** Everything about the game, for `GET /api/games/<code>/debug` (ADR 0117); null if there's no game. */
  async debugDump(): Promise<Record<string, unknown> | null> {
    if (!this.setup) return null;
    const sealed = await this.ctx.storage.list<StoredSealedTurn>({ prefix: 'sealed:' });
    const turns = [...sealed.values()].sort((a, b) => a.turn - b.turn);
    const turn = this.turn;
    return {
      setup: this.setup,
      version: this.version,
      sealedTurns: turns,
      currentTurn: turn && {
        number: turn.turnStart.turn.number,
        currentStep: turn.currentStep,
        turnStart: withoutDeckCards(turn.turnStart, this.cards),
        statements: turn.statements,
        pinned: turn.pinned,
        reading: turn.reading ?? null,
        resolved: this.resolved,
        board: this.board && { ...this.board, state: withoutDeckCards(this.board.state, this.cards), summary: replaySummary(this.resolved, this.board) },
      },
      interpretations: (await this.ctx.storage.get<InterpretationRecord[]>(INTERPRETATIONS)) ?? [],
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (!this.setup) {
      return new Response('No game with that code', { status: 404 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    attach(server, { seatId: null });
    this.sendUpdate(server, this.view());
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return send(ws, { type: 'error', message: 'Messages must be JSON' });
    }
    const parsed = DeviceMessage.safeParse(json);
    if (!parsed.success) {
      this.logEvent('message-invalid', { seat: attachment(ws).seatId, issue: parsed.error.issues[0]?.message });
      return send(ws, { type: 'error', message: parsed.error.issues[0]?.message ?? 'Unknown message' });
    }
    this.logEvent('message', { seat: attachment(ws).seatId, ...parsed.data });
    try {
      await this.handle(ws, parsed.data);
    } catch (e) {
      if (e instanceof Rejected) {
        this.logEvent('message-rejected', { seat: attachment(ws).seatId, type: parsed.data.type, reason: e.message });
        return send(ws, { type: 'error', message: e.message });
      }
      throw e;
    }
    if (parsed.data.type === 'debugLog' || parsed.data.type === 'report') return;
    if (parsed.data.type === 'statement' || parsed.data.type === 'retryInterpretation') this.interpretSoon();
    await this.changed();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    if (attachment(ws).seatId) await this.changed(ws);
  }

  private async handle(ws: WebSocket, message: DeviceMessage): Promise<void> {
    const setup = this.setup!;
    switch (message.type) {
      case 'report': {
        if (this.env.TEST_PHASE !== 'true') throw new Rejected('Reports are only taken during the test phase');
        const seatId = attachment(ws).seatId;
        const dump = (await this.debugDump())!;
        const { json, trimmed } = fitDump(dump);
        const id = crypto.randomUUID();
        const turn = this.turn;
        await this.env.DB.prepare(
          `INSERT INTO reports (id, game_code, turn, step, reporter_seat, reporter_name, text, dump, dump_trimmed, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        )
          .bind(id, setup.code, turn?.turnStart.turn.number ?? null, turn?.currentStep ?? null, seatId, seatId ? (this.seat(seatId).name ?? null) : null, message.text, json, trimmed ? 1 : 0, new Date().toISOString())
          .run();
        console.log({ message: 'report', game: setup.code, id, seat: seatId, text: message.text, trimmed });
        return send(ws, { type: 'reported', id });
      }
      case 'debugLog': {
        const interpretations = (await this.ctx.storage.get<InterpretationRecord[]>(INTERPRETATIONS)) ?? [];
        return send(ws, { type: 'debugLog', interpretations: [...interpretations].reverse() });
      }
      case 'join': {
        this.inLobby('Joining');
        if (attachment(ws).seatId) throw new Rejected('This device already has a seat');
        if (setup.seats.length >= MAX_SEATS) throw new Rejected(`A game has at most ${MAX_SEATS} seats`);
        const seat: Seat = { id: `p${setup.nextSeat}`, name: message.name, deck: await this.savedDeck(message.deckId) };
        setup.nextSeat++;
        setup.seats.push(seat);
        attach(ws, { seatId: seat.id });
        return;
      }
      case 'claim': {
        this.seat(message.seatId);
        const holders = this.holders(message.seatId).filter((other) => other !== ws);
        if (holders.length > 0 && !message.takeOver) throw new Rejected('Another device has this seat');
        for (const other of holders) attach(other, { seatId: null });
        attach(ws, { seatId: message.seatId });
        return;
      }
      case 'watch':
        attach(ws, { seatId: null });
        return;
      case 'editSeat': {
        this.inLobby('Seats');
        const seat = this.seat(message.seatId);
        if (message.name !== undefined) seat.name = message.name;
        if (message.deckId !== undefined) seat.deck = await this.savedDeck(message.deckId);
        return;
      }
      case 'removeSeat': {
        this.inLobby('Seats');
        this.seat(message.seatId);
        setup.seats = setup.seats.filter((s) => s.id !== message.seatId);
        for (const holder of this.holders(message.seatId)) attach(holder, { seatId: null });
        return;
      }
      case 'reorder': {
        this.inLobby('Seats');
        const current = setup.seats.map((s) => s.id);
        const same = message.seatIds.length === current.length && current.every((id) => message.seatIds.includes(id));
        if (!same) throw new Rejected('The new order must list every seat once');
        setup.seats = message.seatIds.map((id) => this.seat(id));
        return;
      }
      case 'start': {
        this.inLobby('Start');
        const first = setup.seats.indexOf(this.seat(message.firstSeatId));
        const decks: Record<string, Deck> = {};
        for (const seat of setup.seats) {
          if (!seat.deck) throw new Rejected(`${seat.name} needs to pick a Deck`);
          const deck = await this.decks.get(seat.deck.id);
          if (!deck) throw new Rejected(`${seat.name}'s Deck isn't in the library any more. Pick another.`);
          decks[seat.id] = deck;
        }
        for (const seat of setup.seats) seat.deck = decks[seat.id];
        setup.decks = decks;
        this.cards = await this.loadCards();
        const clockwiseFromFirst = [...setup.seats.slice(first), ...setup.seats.slice(0, first)];
        const turnStart = createGame(
          clockwiseFromFirst.map((s) => {
            const deck = decks[s.id];
            const commander = deck?.commanders[0];
            return { id: s.id, name: s.name, ...(commander ? { commander, colorIdentity: deck.colorIdentity } : {}) };
          }),
          this.cards.definitions,
        );
        setup.started = true;
        setup.firstSeatId = message.firstSeatId;
        this.turn = newTurn(turnStart);
        return;
      }
      case 'statement': {
        const turn = this.inGame();
        const own = attachment(ws).seatId;
        if (own && message.seatId && message.seatId !== own) throw new Rejected('A phone speaks only for its own seat');
        const playerId = own ?? message.seatId;
        if (!playerId) throw new Rejected('Say whose statement this is');
        this.seat(playerId);
        // A typed statement has no button press, so it's ordered by when it reached the game; device clocks can't be trusted.
        turn.statements.push({
          id: `s${turn.statements.length + 1}`,
          playerId,
          pressedAt: new Date().toISOString(),
          text: message.text,
          ...(message.answering ? { answering: message.answering } : {}),
        });
        turn.transcriptVersion++;
        return;
      }
      case 'retryInterpretation': {
        const turn = this.inGame();
        if (turn.statements.length === 0) throw new Rejected('Nothing has been said yet');
        return;
      }
      case 'adjustLife': {
        const turn = this.inGame();
        const playerId = attachment(ws).seatId;
        if (!playerId) throw new Rejected('Only a seated device can change its life');
        const entry: TimelineEntry = { step: turn.currentStep, playerId, gameAction: { type: 'life', playerId, delta: message.delta }, from: [] };
        turn.pinned.push({ entry, afterStatements: turn.statements.length });
        return;
      }
      case 'doItAnyway': {
        const turn = this.inGame();
        const playerId = attachment(ws).seatId;
        if (!playerId) throw new Rejected('Only a seated player can choose Do it anyway');
        const override = { code: message.code as RulesWarningCode, from: message.from, objectIds: message.objectIds, playerId };
        const warning = this.board?.warnings.find((w) => overrideMatches(override, w));
        if (!warning) throw new Rejected('That warning is no longer there');
        if (!warning.overriddenBy) turn.overrides.push(override);
        return;
      }
      case 'taskDone': {
        const turn = this.inGame();
        const doneBy = attachment(ws).seatId;
        if (!doneBy) throw new Rejected('Only a seated player can mark a task done');
        const done = { playerId: message.playerId, text: message.text, from: message.from, doneBy };
        const task = this.board && tableView(this.board).playerTasks.find((t) => taskDoneMatches(done, t));
        if (!task) throw new Rejected('That task is no longer there');
        if (!task.doneBy) turn.doneTasks.push(done);
        return;
      }
      case 'nextStep':
      case 'jumpToStep': {
        const turn = this.inGame();
        if (message.from !== turn.currentStep) throw new Rejected('The Step has already moved on');
        const ahead = stepsAhead(this.board!.state);
        const to = message.type === 'nextStep' ? (ahead[0] ?? 'endTurn') : message.to;
        if (to === 'endTurn') return this.sealTurn(turn);
        if (!ahead.includes(to)) throw new Rejected('The step menu only jumps forward, to a Step that happens this turn');
        turn.currentStep = to;
        return;
      }
      case 'end':
        if (setup.ended) throw new Rejected('The game has already ended');
        return this.end(this.inGame(), attachment(ws).seatId);
      case 'restart':
        return this.restart(this.inGame(), attachment(ws).seatId);
    }
  }

  private async sealTurn(turn: Turn): Promise<void> {
    const { sealed, nextTurnStart, warnings } = sealTurn(turn.turnStart, this.resolved.timeline, { overrides: turn.overrides, doneTasks: turn.doneTasks });
    await this.storeSealed(sealed, turn, warnings);
    this.logEvent('turn-sealed', { sealed: sealed.turn, warnings: warnings.map((w) => `${w.code}: ${w.message}`) });
    this.turn = newTurn(nextTurnStart);
  }

  /** Seals the turn where the table is and freezes the game (ADR 0100, 0101). */
  private async end(turn: Turn, by: string | null): Promise<void> {
    const setup = this.setup!;
    const { sealed, warnings } = sealTurn(turn.turnStart, this.resolved.timeline, { through: turn.currentStep, overrides: turn.overrides, doneTasks: turn.doneTasks });
    await this.storeSealed(sealed, turn, warnings);
    clearTimeout(this.interpretTimer);
    this.turn = null;
    this.endedBoard = { state: sealed.finalBoard, events: [], tableEvents: [], warnings };
    setup.ended = { at: new Date().toISOString(), turn: sealed.turn, by };
    this.logEvent('game-ended', { sealed: sealed.turn, by });
    const joinCode = setup.joinCode;
    setup.joinCode = null;
    await this.save();
    // Saved first, so a D1 failure leaves the code to the 24-hour rule instead of failing the end (ADR 0101).
    if (joinCode) await retireJoinCode(this.env.DB, joinCode, setup.code).catch((e: unknown) => console.error('Retiring the join code failed', e));
  }

  /** Back to the lobby with the same seats, Decks and join code; every turn and interpretation is cleared (ADR 0145). */
  private async restart(turn: Turn, by: string | null): Promise<void> {
    const setup = this.setup!;
    this.logEvent('game-restarted', { turn: turn.turnStart.turn.number, by });
    clearTimeout(this.interpretTimer);
    this.interpretWaiting = false;
    this.interpreting = false;
    this.restarts++;
    this.turn = null;
    setup.started = false;
    delete setup.firstSeatId;
    delete setup.decks;
    const sealed = await this.ctx.storage.list({ prefix: 'sealed:' });
    await this.ctx.storage.delete([...sealed.keys(), INTERPRETATIONS]);
  }

  private async storeSealed(sealed: SealedTurn, turn: Turn, warnings: RulesWarning[]): Promise<void> {
    const stored: StoredSealedTurn = { ...sealed, finalBoard: withoutDeckCards(sealed.finalBoard, this.cards), statements: turn.statements, warnings };
    await this.ctx.storage.put(`sealed:${sealed.turn}`, stored);
  }

  /** Restarts the wait after each statement; while a request is in flight, its return sends the next one (ADR 0017). */
  private interpretSoon(): void {
    if (this.interpreting) return;
    clearTimeout(this.interpretTimer);
    this.interpretWaiting = true;
    this.interpretTimer = setTimeout(() => {
      this.interpretWaiting = false;
      void this.interpret();
    }, this.interpretAfterMs);
  }

  /** One request at a time, always with the whole turn. A failure keeps the last reading (ADR 0067). */
  private async interpret(): Promise<void> {
    const turn = this.turn;
    if (!turn || this.interpreting) return;
    const asked = { turn: turn.turnStart.turn.number, transcriptVersion: turn.transcriptVersion, restarts: this.restarts };
    this.interpreting = true;
    const prompt = buildPrompt({
      turnStart: turn.turnStart,
      statements: [...turn.statements],
      currentStep: turn.currentStep,
      pinned: [...turn.pinned],
      openQuestions: [...this.resolved.questions],
      ...(Object.keys(this.cards.text).length > 0 ? { deckCards: this.cards.text } : {}),
    });
    const record = {
      at: new Date().toISOString(),
      turn: asked.turn,
      transcriptVersion: asked.transcriptVersion,
      promptVersion: prompt.version,
      ...(prompt.cardsVersion ? { cardsVersion: prompt.cardsVersion } : {}),
      user: prompt.user,
    };
    const started = Date.now();
    try {
      let provider: LlmProvider | undefined;
      let result;
      try {
        provider = this.provider();
        result = await interpretPrompt(provider, prompt);
      } catch (e) {
        const id = provider?.id ?? 'none';
        await this.record({ ...record, provider: id, model: id, error: String(e), ...(e instanceof LlmOutputError ? { answer: e.raw } : {}), latencyMs: Date.now() - started }, asked.restarts);
        throw e;
      }
      const { output } = result;
      await this.record({
        ...record,
        provider: provider.id,
        model: result.model,
        answer: result.raw,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        ...(result.usage.cacheReadTokens !== undefined ? { cacheReadTokens: result.usage.cacheReadTokens } : {}),
        ...(result.usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: result.usage.cacheWriteTokens } : {}),
        latencyMs: result.latencyMs,
      }, asked.restarts);
      const current = this.turn;
      const stale = !current || asked.restarts !== this.restarts || current.turnStart.turn.number !== asked.turn || (current.reading?.transcriptVersion ?? 0) >= asked.transcriptVersion;
      if (!stale) {
        current.reading = { timeline: output, transcriptVersion: asked.transcriptVersion };
        this.advanceStep(current);
        await this.changed();
      }
    } catch (e) {
      console.error('Interpretation failed', e);
      if (asked.restarts !== this.restarts) return;
      this.interpreting = false;
      await this.changed();
    } finally {
      if (asked.restarts === this.restarts) this.interpreting = false;
    }
    const now = this.turn;
    if (now && asked.restarts === this.restarts && (now.turnStart.turn.number !== asked.turn || now.transcriptVersion !== asked.transcriptVersion) && now.statements.length > 0) {
      await this.interpret();
    }
  }

  /** Logs one interpretation to Workers Logs (ADR 0108) and keeps the last few for the debug panel (ADR 0109). */
  private async record(interpretation: InterpretationRecord, restarts = this.restarts): Promise<void> {
    console.log({ message: 'interpretation', game: this.setup?.code, ...interpretation });
    if (restarts !== this.restarts) return;
    const kept = (await this.ctx.storage.get<InterpretationRecord[]>(INTERPRETATIONS)) ?? [];
    await this.ctx.storage.put(INTERPRETATIONS, [...kept, interpretation].slice(-KEPT_INTERPRETATIONS));
  }

  private provider(): LlmProvider {
    if (!this.interpreter) {
      if (!this.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
      this.interpreter = claudeProvider({ apiKey: this.env.ANTHROPIC_API_KEY });
    }
    return this.interpreter;
  }

  private inGame(): Turn {
    if (this.setup!.ended) throw new Rejected('This game has ended.');
    if (!this.turn) throw new Rejected('The game hasn\'t started yet');
    return this.turn;
  }

  private replay(): void {
    const turn = this.turn;
    if (!turn) {
      this.board = null;
      return;
    }
    this.resolved = resolveTurn(turn);
    this.board = replayTurn(turn.turnStart, this.resolved.timeline, { currentStep: turn.currentStep, overrides: turn.overrides, doneTasks: turn.doneTasks });
    this.logEvent('replayed', replaySummary(this.resolved, this.board));
  }

  /** One JSON line per event while the test phase is on (ADR 0116); Workers Logs indexes the fields. */
  private logEvent(event: string, fields: Record<string, unknown> = {}): void {
    if (this.env.TEST_PHASE !== 'true') return;
    console.log({ message: event, game: this.setup?.code, turn: this.turn?.turnStart.turn.number, step: this.turn?.currentStep, ...fields });
  }

  /**
   * A statement placing something in a later Step moves the table there; statements never move it back (ADR 0066).
   * Until #47, the latest Step in the timeline stands in for where the table is.
   */
  private advanceStep(turn: Turn): void {
    const latest = resolveTurn(turn).timeline.reduce((i, e) => Math.max(i, STEPS.indexOf(e.step)), STEPS.indexOf(turn.currentStep));
    turn.currentStep = STEPS[latest]!;
  }

  private inLobby(what: string): void {
    if (this.setup!.started) throw new Rejected(`${what} can't change once the game has started`);
  }

  private seat(id: string): Seat {
    const seat = this.setup!.seats.find((s) => s.id === id);
    if (!seat) throw new Rejected('No such seat');
    return seat;
  }

  private async savedDeck(id: string): Promise<Deck> {
    const deck = await this.decks.get(id);
    if (!deck) throw new Rejected('That Deck isn\'t saved');
    return deck;
  }

  private holders(seatId: string, except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && attachment(ws).seatId === seatId);
  }

  /** Saves, raises the version and sends every device its update. `closing` is a socket that no longer counts as connected. */
  private async changed(closing?: WebSocket): Promise<void> {
    await this.keepJoinCode();
    this.version++;
    this.replay();
    await this.save();
    const view = this.view();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== closing) this.sendUpdate(ws, view, closing);
    }
  }

  private async save(): Promise<void> {
    const turn = this.turn && { ...this.turn, turnStart: withoutDeckCards(this.turn.turnStart, this.cards) };
    await this.ctx.storage.put({ setup: this.setup, version: this.version, turn });
  }

  /** The cards of every seat's Deck version. Games from before versions have none (ADR 0119). */
  private async loadCards(): Promise<GameCards> {
    const versionIds = Object.values(this.setup?.decks ?? {}).flatMap((d) => (d.versionId ? [d.versionId] : []));
    try {
      return await loadGameCards(this.env.DB, versionIds);
    } catch (e) {
      // Without D1 the game runs without card data, as games did before, until the next wake-up (ADR 0119).
      console.error('Loading the game\'s cards failed', e);
      return NO_CARDS;
    }
  }

  private view(): TableView | null {
    if (this.endedBoard) {
      return { ...tableView(this.endedBoard), awaitingResponseFrom: [], combatPreview: null, reminders: [], stepsAhead: [] };
    }
    return this.board ? tableView(this.board) : null;
  }

  /** Tells D1 the game is still being played, at most every ten minutes, and drops a code that was retired (ADR 0095). */
  private async keepJoinCode(): Promise<void> {
    const setup = this.setup!;
    const now = new Date();
    if (!setup.joinCode || now.getTime() - this.joinCodeTouchedAt < JOIN_CODE_TOUCH_MS) return;
    this.joinCodeTouchedAt = now.getTime();
    if (!(await touchJoinCode(this.env.DB, setup.joinCode, setup.code, now))) setup.joinCode = null;
  }

  /** A statement the last reading covered is read; one past it is being read while a request is due or under way, and otherwise couldn't be (ADR 0067). */
  private log(): TurnLog | null {
    const turn = this.turn;
    if (!turn) return null;
    const readUpTo = turn.reading?.transcriptVersion ?? 0;
    const busy = this.interpreting || this.interpretWaiting;
    const status = (i: number): StatementStatus => (i < readUpTo ? 'read' : busy ? 'interpreting' : 'failed');
    return {
      statements: turn.statements.map((s, i) => ({ id: s.id, playerId: s.playerId, text: s.text, status: status(i) })),
      entries: this.resolved.timeline,
      questions: this.resolved.questions,
    };
  }

  private sendUpdate(ws: WebSocket, view: TableView | null, closing?: WebSocket): void {
    const setup = this.setup!;
    send(ws, {
      type: 'update',
      version: this.version,
      you: attachment(ws).seatId,
      seats: setup.seats.map(({ deck, ...s }) => ({
        ...s,
        ...(deck ? { deck: { id: deck.id, name: deck.name, commanders: deck.commanders, colorIdentity: deck.colorIdentity } } : {}),
        connected: this.holders(s.id, closing).length > 0,
      })),
      started: setup.started,
      ended: setup.ended ?? null,
      joinCode: setup.joinCode ?? null,
      view,
      log: this.log(),
    });
  }
}

function newTurn(turnStart: GameState): Turn {
  return { turnStart, pinned: [], currentStep: 'upkeep', statements: [], transcriptVersion: 0, overrides: [], doneTasks: [] };
}

/** A turn as stored before taps were pinned: its taps were the whole `timeline`, all before any statement. */
type StoredTurn = Partial<Turn> & { timeline?: TimelineEntry[] };

function loadTurn(stored: StoredTurn | undefined): Turn | null {
  if (!stored?.turnStart) return null;
  const { timeline, ...turn } = stored;
  return {
    statements: [],
    transcriptVersion: 0,
    currentStep: 'upkeep',
    overrides: [],
    doneTasks: [],
    ...turn,
    pinned: turn.pinned ?? (timeline ?? []).map((entry) => ({ entry, afterStatements: 0 })),
  } as Turn;
}

/** The reading resolved, with the taps placed among its entries. A reading that won't resolve leaves just the taps. */
function resolveTurn(turn: Turn): ResolvedTimeline {
  const options = { pinned: turn.pinned, statementIds: turn.statements.map((s) => s.id) };
  try {
    return resolveTimeline(turn.turnStart, turn.reading?.timeline ?? { entries: [], questions: [] }, options);
  } catch (e) {
    console.error('Reading did not resolve; showing the taps alone', e);
    return resolveTimeline(turn.turnStart, { entries: [], questions: [] }, options);
  }
}

function attachment(ws: WebSocket): Attachment {
  return (ws.deserializeAttachment() as Attachment | null) ?? { seatId: null };
}

function attach(ws: WebSocket, value: Attachment): void {
  ws.serializeAttachment(value);
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
