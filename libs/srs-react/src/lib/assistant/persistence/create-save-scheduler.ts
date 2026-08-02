export const STREAM_SAVE_THROTTLE_MS = 1000;
export const IDLE_SAVE_DEBOUNCE_MS = 250;

export type SaveFlushOptions = {
  cancelStreamingRuns?: boolean;
};

export type CreateSaveSchedulerOptions = {
  flush: (options?: SaveFlushOptions) => void;
  throttleMs: number;
  debounceMs: number;
  isStreaming: () => boolean;
};

export type SaveScheduler = {
  schedule: () => void;
  flushNow: (options?: SaveFlushOptions) => void;
  flushIfPending: () => void;
};

/**
 * Throttle/debounce coalescing for conversation autosave.
 * Framework-free so timing can be unit-tested with fake timers
 * (ASSISTANT-CHAT-CONVERSATIONS.md §Persistence).
 */
export function createSaveScheduler({
  flush,
  throttleMs,
  debounceMs,
  isStreaming,
}: CreateSaveSchedulerOptions): SaveScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFiredAt = 0;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const flushNow = (options: SaveFlushOptions = {}) => {
    clearTimer();
    flush(options);
  };

  const schedule = () => {
    const now = Date.now();
    const wait = isStreaming() ? throttleMs : debounceMs;
    // WHY: clamp to `wait`. Without it, a pending idle schedule (lastFiredAt in
    // the future) plus a streaming bump computes delay > throttle window, so the
    // save never fires inside the throttle. Clamping also resets idle debounce
    // to a full `wait` from the latest bump.
    const delay = Math.min(wait, Math.max(0, wait - (now - lastFiredAt)));
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      flush({ cancelStreamingRuns: true });
    }, delay);
    // WHY: track the scheduled fire time, not `now`, so back-to-back bumps
    // measure relative to the next fire and coalesce instead of cascading.
    lastFiredAt = now + delay;
  };

  const flushIfPending = () => {
    if (!timer) return;
    clearTimer();
    flush({ cancelStreamingRuns: true });
  };

  return { schedule, flushNow, flushIfPending };
}
