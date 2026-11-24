import type { DeviceMessage, ServerMessage } from '@onthestack/server/protocol';

type Update = Extract<ServerMessage, { type: 'update' }>;

/** What this browser remembers for one game (ADR 0053): its seat, that it's a Shared screen, or nothing yet. */
export type SeatMemory = { seatId: string } | 'watching' | null;

const key = (code: string) => `onthestack.seat.${code}`;

export function loadMemory(code: string): SeatMemory {
  try {
    const raw = localStorage.getItem(key(code));
    if (raw === 'watching') return 'watching';
    return raw ? { seatId: raw } : null;
  } catch {
    return null;
  }
}

export function saveMemory(code: string, memory: SeatMemory): void {
  try {
    if (memory === null) localStorage.removeItem(key(code));
    else localStorage.setItem(key(code), memory === 'watching' ? 'watching' : memory.seatId);
  } catch {
    // Private windows can refuse storage; the device then just asks again after a reload.
  }
}

export function sameMemory(a: SeatMemory, b: SeatMemory): boolean {
  if (a === null || b === null || a === 'watching' || b === 'watching') return a === b;
  return a.seatId === b.seatId;
}

/** What to send when a socket opens. Never `takeOver`: a reload must not take a seat another device has claimed since. */
export function onOpen(memory: SeatMemory): DeviceMessage | null {
  if (memory === 'watching') return { type: 'watch' };
  return memory ? { type: 'claim', seatId: memory.seatId } : null;
}

/**
 * The memory after an update. `heldBefore` is the seat this socket held in its previous update: losing it means the
 * seat moved to another device or was removed, so the device goes back to choosing.
 */
export function afterUpdate(memory: SeatMemory, update: Update, heldBefore: string | null): SeatMemory {
  if (update.you) return { seatId: update.you };
  if (heldBefore && memory !== 'watching') return null;
  return memory;
}

/** A remembered seat that can't be reclaimed is forgotten, so the device offers "That's me" instead. */
export function afterClaimRefused(memory: SeatMemory): SeatMemory {
  return memory === 'watching' ? memory : null;
}
