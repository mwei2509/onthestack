export const COMBINE_MS = 1500;

/**
 * Gathers − / + taps and sends their total once the player has paused (ADR 0067), so three quick taps are one loss of
 * 3, not three losses of 1. A total of 0 sends nothing.
 */
export function createTapCombiner(send: (delta: number) => void, onPending: (delta: number) => void, delayMs = COMBINE_MS) {
  let pending = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const delta = pending;
    pending = 0;
    onPending(0);
    if (delta !== 0) send(delta);
  };
  return {
    tap(delta: number) {
      pending += delta;
      onPending(pending);
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      clearTimeout(timer);
      pending = 0;
      onPending(0);
    },
  };
}
