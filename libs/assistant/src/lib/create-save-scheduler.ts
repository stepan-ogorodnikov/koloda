export const STREAM_SAVE_THROTTLE_MS = 1000;
export const IDLE_SAVE_DEBOUNCE_MS = 250;

export type CreateSaveSchedulerOptions = {
  flush: () => void;
  throttleMs: number;
  debounceMs: number;
  isStreaming: () => boolean;
};

export type SaveScheduler = {
  schedule: () => void;
  flushNow: () => void;
  flushIfPending: () => void;
  /** Drop a coalesced timer without flushing — used when delete tombstones a queue. */
  cancel: () => void;
};

/**
 * Throttle/debounce coalescing for conversation autosave.
 * Framework-free so timing can be unit-tested with fake timers
 * (ASSISTANT-CHAT-CONVERSATIONS.md §Persistence).
 *
 * Streaming checkpoints are persisted as-is (`streaming` status). Restore
 * normalizes orphaned streaming runs to `interrupted`/`crash_recovery`.
 */
export function createSaveScheduler({
  flush,
  throttleMs,
  debounceMs,
  isStreaming,
}: CreateSaveSchedulerOptions): SaveScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // WHY: track the last *actual* flush time. The previous design stored a
  // future scheduled fire time and cleared/rescheduled on every dirty bump,
  // which starved checkpoints when chunks arrived faster than the throttle.
  let lastFlushedAt = 0;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const fire = () => {
    clearTimer();
    lastFlushedAt = Date.now();
    flush();
  };

  const flushNow = () => {
    fire();
  };

  const schedule = () => {
    const now = Date.now();
    const wait = isStreaming() ? throttleMs : debounceMs;
    const elapsed = now - lastFlushedAt;

    if (elapsed >= wait) {
      // Leading edge (also covers never-flushed: lastFlushedAt === 0).
      fire();
      return;
    }

    if (isStreaming()) {
      // INVARIANT: trailing save fires at lastFlushedAt + throttleMs.
      // Clear + re-arm with remaining delay is safe (absolute fire time is
      // unchanged) and drops any idle debounce timer from a mode switch.
      clearTimer();
      const delay = wait - elapsed;
      timer = setTimeout(() => {
        timer = null;
        fire();
      }, delay);
      return;
    }

    // WHY: idle dirty bumps reset the debounce window from now so a quiet
    // pause after the last edit still lands one trailing save.
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      fire();
    }, wait);
  };

  const flushIfPending = () => {
    if (!timer) return;
    fire();
  };

  const cancel = () => {
    clearTimer();
  };

  return { schedule, flushNow, flushIfPending, cancel };
}
