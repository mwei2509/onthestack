// The game this browser was last in, for Home's Continue card (ADR 0111).
const KEY = 'onthestack.lastGame:v1';

export function rememberGame(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Storage can be refused (private windows); Home then just has no Continue card.
  }
}

/** Forgets `code` only if it's still the remembered game, so an old tab can't wipe a newer one. */
export function forgetGame(code: string): void {
  try {
    if (localStorage.getItem(KEY) === code) localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}

export function lastGame(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
