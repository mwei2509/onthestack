import { STEPS, type TableView } from '@onthestack/engine';
import { z } from 'zod';

const seatId = z.string().min(1).max(16);
const name = z.string().trim().min(1, 'A name is needed').max(24, 'Names are at most 24 characters');
const deckId = z.string().min(1).max(64);
const step = z.enum(STEPS);

/** Everything a device can send. Devices are untrusted, so every message is parsed against this (ADR 0055). */
export const DeviceMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name, deckId: deckId.optional() }),
  /** "That's me". Without `takeOver`, it fails while another device holds the seat, so a reload never steals one back. */
  z.object({ type: z.literal('claim'), seatId, takeOver: z.boolean().optional() }),
  z.object({ type: z.literal('watch') }),
  z.object({ type: z.literal('editSeat'), seatId, name: name.optional(), deckId: deckId.nullable().optional() }),
  z.object({ type: z.literal('removeSeat'), seatId }),
  z.object({ type: z.literal('reorder'), seatIds: z.array(seatId).max(16) }),
  z.object({ type: z.literal('start'), firstSeatId: seatId }),
  /** A tap on − or + for this device's own seat, after quick taps are combined (ADR 0067). */
  z.object({ type: z.literal('adjustLife'), delta: z.number().int().min(-999).max(999).refine((n) => n !== 0, 'A life change can\'t be 0') }),
  /** `from` is the Step the device saw, so two screens pressing at once move one Step, not two. */
  z.object({ type: z.literal('nextStep'), from: step }),
  z.object({ type: z.literal('jumpToStep'), from: step, to: z.union([step, z.literal('endTurn')]) }),
]);
export type DeviceMessage = z.infer<typeof DeviceMessage>;

export interface SeatView {
  id: string;
  name: string;
  deckId?: string;
  connected: boolean;
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
      /** What every screen shows, once the game has started. */
      view: TableView | null;
    }
  | { type: 'error'; message: string };
