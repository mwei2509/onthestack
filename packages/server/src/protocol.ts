import { STEPS, type TableView, type TimelineEntry } from '@onthestack/engine';
import type { InterpretedQuestion } from '@onthestack/interpreter';
import { z } from 'zod';

const seatId = z.string().min(1).max(16);
export const SeatName = z.string().trim().min(1, 'A name is needed').max(24, 'Names are at most 24 characters');
const deckId = z.string().min(1).max(64);
const step = z.enum(STEPS);

/** Everything a device can send. Devices are untrusted, so every message is parsed against this (ADR 0055). */
export const DeviceMessage = z.discriminatedUnion('type', [
  /** A seat needs a Deck from the library (ADR 0080). */
  z.object({ type: z.literal('join'), name: SeatName, deckId }),
  /** "That's me". Without `takeOver`, it fails while another device holds the seat, so a reload never steals one back. */
  z.object({ type: z.literal('claim'), seatId, takeOver: z.boolean().optional() }),
  z.object({ type: z.literal('watch') }),
  z.object({ type: z.literal('editSeat'), seatId, name: SeatName.optional(), deckId: deckId.optional() }),
  z.object({ type: z.literal('removeSeat'), seatId }),
  z.object({ type: z.literal('reorder'), seatIds: z.array(seatId).max(16) }),
  z.object({ type: z.literal('start'), firstSeatId: seatId }),
  /** A tap on − or + for this device's own seat, after quick taps are combined (ADR 0076). */
  z.object({ type: z.literal('adjustLife'), delta: z.number().int().min(-999).max(999).refine((n) => n !== 0, 'A life change can\'t be 0') }),
  /** `from` is the Step the device saw, so two screens pressing at once move one Step, not two. */
  z.object({ type: z.literal('nextStep'), from: step }),
  z.object({ type: z.literal('jumpToStep'), from: step, to: z.union([step, z.literal('endTurn')]) }),
  /**
   * A PlayerStatement; "I" is its seat's player (ADR 0069). A seated device speaks for its own seat; a Shared screen
   * names the seat whose card was used (ADR 0107).
   */
  z.object({
    type: z.literal('statement'),
    text: z.string().trim().min(1, 'Say what happened first').max(500, 'Statements are at most 500 characters'),
    seatId: seatId.optional(),
    /** The question's text, when this is an answer to it (ADR 0114). */
    answering: z.string().trim().min(1).max(500).optional(),
  }),
  /** Ends the game for everyone, after the device's confirm (ADR 0092, 0101). */
  z.object({ type: z.literal('end') }),
  /** Back to the lobby with the same seats and Decks, clearing every turn, after the device's confirm (ADR 0145). */
  z.object({ type: z.literal('restart') }),
  /** "Do it anyway" on a RulesWarning, identified by its code, the statements that raised it and the objects it's about (ADR 0123). */
  z.object({ type: z.literal('doItAnyway'), code: z.string().min(1).max(40), from: z.array(z.string().min(1).max(16)).min(1).max(64), objectIds: z.array(z.string().min(1).max(16)).max(64) }),
  /** Done on a PlayerTask, identified by its player, text and the statements that set it off (ADR 0125). */
  z.object({ type: z.literal('taskDone'), playerId: seatId, text: z.string().min(1).max(500), from: z.array(z.string().min(1).max(16)).max(64) }),
  /** Try again on statements the last reading couldn't interpret (ADR 0067, 0106). */
  z.object({ type: z.literal('retryInterpretation') }),
  /** The `?debug` panel asking for the game's last interpretations (ADR 0109). Any device can ask. */
  z.object({ type: z.literal('debugLog') }),
  /** "Something's wrong?": what the player expected, saved with the game as it is now (ADR 0118). */
  z.object({ type: z.literal('report'), text: z.string().trim().min(1, 'Say what you expected').max(2000, 'Reports are at most 2000 characters') }),
]);
export type DeviceMessage = z.infer<typeof DeviceMessage>;

export interface SeatView {
  id: string;
  name: string;
  /** The seat's Deck as it was picked (ADR 0085); the game's copy from Start, once started. */
  deck?: { id: string; name: string; commanders: string[]; colorIdentity: string[] };
  connected: boolean;
}

/** When a game ended, in which turn, and the seat that ended it; null for the shared screen (ADR 0101). */
export interface Ended {
  at: string;
  turn: number;
  by: string | null;
}

/** What `GET /api/games/<code>` says about a game besides its code (ADR 0111). */
export interface GameSummary {
  status: 'lobby' | 'playing' | 'ended';
  /** The current turn while playing; the turn it ended in once ended. */
  turn: number | null;
}

export type ServerMessage =
  | {
      type: 'update';
      /** Rises with every change, so a device can ignore anything older than what it has. */
      version: number;
      /** The seat this device holds, if any. */
      you: string | null;
      seats: SeatView[];
      started: boolean;
      ended: Ended | null;
      /** The six-digit code for Join game, until it's retired (ADR 0095). */
      joinCode: string | null;
      /** What every screen shows, once the game has started. */
      view: TableView | null;
      /** The turn's log: what was said and what the board was replayed from, once the game has started (ADR 0106). */
      log: TurnLog | null;
    }
  | { type: 'error'; message: string }
  | { type: 'debugLog'; interpretations: InterpretationRecord[] }
  | { type: 'reported'; id: string };

/** One interpretation as ADR 0108 logs it and ADR 0109's panel shows it. */
export interface InterpretationRecord {
  at: string;
  turn: number;
  transcriptVersion: number;
  provider: string;
  model: string;
  /** Which system prompt was sent; its text is in the code that version was built from. */
  promptVersion: string;
  /** Which card block was sent, never its text (ADR 0121); absent for games without Deck cards. */
  cardsVersion?: string;
  /** The user message sent: the board, cards on no Deck, and what was said this turn. */
  user: string;
  /** The answer as the provider returned it, when there was one; a malformed answer is kept too. */
  answer?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Input tokens read from the provider's cache, and written to it, on top of `inputTokens`. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs: number;
}

export type StatementStatus = 'read' | 'interpreting' | 'failed';

export interface TurnLog {
  /** The TurnTranscript in the order it was said, each with how far the reading has got. */
  statements: { id: string; playerId: string; text: string; status: StatementStatus }[];
  /** The engine timeline the board was replayed from; a tap's entry cites no statements (ADR 0065). */
  entries: TimelineEntry[];
  /** What the reading couldn't settle, asked of a player instead of guessed (ADR 0043, 0068). */
  questions: InterpretedQuestion[];
}
