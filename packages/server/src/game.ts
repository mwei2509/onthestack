import { DurableObject } from 'cloudflare:workers';
import { createGame, replayTurn, sealTurn, stepsAhead, tableView, type GameState, type PlayerStatement, type ReplayResult, type RulesWarning, type SealedTurn, type Step, type TableView, type TimelineEntry } from '@onthestack/engine';
import { claudeProvider, interpretTurn, type InterpretedTimeline, type LlmProvider } from '@onthestack/interpreter';
import { libraryDecks, type Deck, type DeckSource } from './decks.js';
import { claimJoinCode, retireJoinCode, touchJoinCode } from './joinCodes.js';
import { DeviceMessage, type Ended, type ServerMessage } from './protocol.js';

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
  /** Each seat's Deck, copied at Start so later edits never change the game (ADR 0050). */
  decks?: Record<string, Deck>;
}

/** The current turn (ADR 0054, 0069, 0074). The board is never stored: it's this, replayed. Sealed turns have keys of their own. */
interface Turn {
  turnStart: GameState;
  timeline: TimelineEntry[];
  currentStep: Step;
  /** The TurnTranscript, in the order statements arrived. */
  statements: PlayerStatement[];
  /** Rises with every change to the TurnTranscript, so a reading can say which one it read (ADR 0017). */
  transcriptVersion: number;
  /** The last InterpretedTimeline applied, and the transcript version it read. */
  reading?: { timeline: InterpretedTimeline; transcriptVersion: number };
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
  private readonly decks: DeckSource;
  private interpreter: LlmProvider | undefined;
  private interpretAfterMs = INTERPRET_AFTER_MS;
  private interpreting = false;
  private interpretTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.decks = libraryDecks(env.DB);
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<unknown>(['setup', 'version', 'turn']);
      this.setup = (stored.get('setup') as Setup | undefined) ?? null;
      this.version = (stored.get('version') as number | undefined) ?? 0;
      const turn = stored.get('turn') as Partial<Turn> | undefined;
      this.turn = turn ? { statements: [], transcriptVersion: 0, ...turn } as Turn : null;
      if (this.setup?.ended) {
        const last = await ctx.storage.get<StoredSealedTurn>(`sealed:${this.setup.ended.turn}`);
        if (last) this.endedBoard = { state: last.finalBoard, events: [], tableEvents: [], warnings: last.warnings ?? [] };
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

  async exists(): Promise<boolean> {
    return this.setup !== null;
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
      return send(ws, { type: 'error', message: parsed.error.issues[0]?.message ?? 'Unknown message' });
    }
    try {
      await this.handle(ws, parsed.data);
    } catch (e) {
      if (e instanceof Rejected) return send(ws, { type: 'error', message: e.message });
      throw e;
    }
    await this.changed();
    if (parsed.data.type === 'statement') this.interpretSoon();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    if (attachment(ws).seatId) await this.changed(ws);
  }

  private async handle(ws: WebSocket, message: DeviceMessage): Promise<void> {
    const setup = this.setup!;
    switch (message.type) {
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
        const clockwiseFromFirst = [...setup.seats.slice(first), ...setup.seats.slice(0, first)];
        const turnStart = createGame(clockwiseFromFirst.map((s) => ({ id: s.id, name: s.name, commander: decks[s.id]?.commanders[0] })));
        setup.started = true;
        setup.firstSeatId = message.firstSeatId;
        setup.decks = decks;
        this.turn = newTurn(turnStart);
        return;
      }
      case 'statement': {
        const turn = this.inGame();
        const playerId = attachment(ws).seatId;
        if (!playerId) throw new Rejected('Only a seated device can say what happened');
        // A typed statement has no button press, so it's ordered by when it reached the game; device clocks can't be trusted.
        turn.statements.push({ id: `s${turn.statements.length + 1}`, playerId, pressedAt: new Date().toISOString(), text: message.text });
        turn.transcriptVersion++;
        return;
      }
      case 'adjustLife': {
        const turn = this.inGame();
        const playerId = attachment(ws).seatId;
        if (!playerId) throw new Rejected('Only a seated device can change its life');
        turn.timeline.push({ step: turn.currentStep, playerId, gameAction: { type: 'life', playerId, delta: message.delta }, from: [] });
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
    }
  }

  private async sealTurn(turn: Turn): Promise<void> {
    const { sealed, nextTurnStart, warnings } = sealTurn(turn.turnStart, turn.timeline);
    await this.storeSealed(sealed, turn, warnings);
    this.turn = newTurn(nextTurnStart);
  }

  /** Seals the turn where the table is and freezes the game (ADR 0100, 0101). */
  private async end(turn: Turn, by: string | null): Promise<void> {
    const setup = this.setup!;
    const { sealed, warnings } = sealTurn(turn.turnStart, turn.timeline, { through: turn.currentStep });
    await this.storeSealed(sealed, turn, warnings);
    clearTimeout(this.interpretTimer);
    this.turn = null;
    this.endedBoard = { state: sealed.finalBoard, events: [], tableEvents: [], warnings };
    setup.ended = { at: new Date().toISOString(), turn: sealed.turn, by };
    const joinCode = setup.joinCode;
    setup.joinCode = null;
    await this.save();
    // Saved first, so a D1 failure leaves the code to the 24-hour rule instead of failing the end (ADR 0101).
    if (joinCode) await retireJoinCode(this.env.DB, joinCode, setup.code).catch((e: unknown) => console.error('Retiring the join code failed', e));
  }

  private async storeSealed(sealed: SealedTurn, turn: Turn, warnings: RulesWarning[]): Promise<void> {
    const stored: StoredSealedTurn = { ...sealed, statements: turn.statements, warnings };
    await this.ctx.storage.put(`sealed:${sealed.turn}`, stored);
  }

  /** Restarts the wait after each statement; while a request is in flight, its return sends the next one (ADR 0017). */
  private interpretSoon(): void {
    if (this.interpreting) return;
    clearTimeout(this.interpretTimer);
    this.interpretTimer = setTimeout(() => void this.interpret(), this.interpretAfterMs);
  }

  /** One request at a time, always with the whole turn. A failure keeps the last reading (ADR 0067). */
  private async interpret(): Promise<void> {
    const turn = this.turn;
    if (!turn || this.interpreting) return;
    const asked = { turn: turn.turnStart.turn.number, transcriptVersion: turn.transcriptVersion };
    this.interpreting = true;
    try {
      const { output } = await interpretTurn(this.provider(), { turnStart: turn.turnStart, statements: [...turn.statements], currentStep: turn.currentStep });
      const current = this.turn;
      const stale = !current || current.turnStart.turn.number !== asked.turn || (current.reading?.transcriptVersion ?? 0) >= asked.transcriptVersion;
      if (!stale) {
        current.reading = { timeline: output, transcriptVersion: asked.transcriptVersion };
        await this.changed();
      }
    } catch (e) {
      console.error('Interpretation failed', e);
    } finally {
      this.interpreting = false;
    }
    const now = this.turn;
    if (now && (now.turnStart.turn.number !== asked.turn || now.transcriptVersion !== asked.transcriptVersion) && now.statements.length > 0) {
      await this.interpret();
    }
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
    this.board = this.turn ? replayTurn(this.turn.turnStart, this.turn.timeline, { currentStep: this.turn.currentStep }) : null;
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
    await this.ctx.storage.put({ setup: this.setup, version: this.version, turn: this.turn });
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

  private sendUpdate(ws: WebSocket, view: TableView | null, closing?: WebSocket): void {
    const setup = this.setup!;
    send(ws, {
      type: 'update',
      version: this.version,
      you: attachment(ws).seatId,
      seats: setup.seats.map((s) => ({ ...s, connected: this.holders(s.id, closing).length > 0 })),
      started: setup.started,
      ended: setup.ended ?? null,
      joinCode: setup.joinCode ?? null,
      view,
    });
  }
}

function newTurn(turnStart: GameState): Turn {
  return { turnStart, timeline: [], currentStep: 'upkeep', statements: [], transcriptVersion: 0 };
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
