import { createSaveScheduler, IDLE_SAVE_DEBOUNCE_MS, STREAM_SAVE_THROTTLE_MS } from "./create-save-scheduler";

export type CreateConversationSaveQueueOptions = {
  /**
   * Perform the durable write for the latest snapshot.
   * Return `false` to skip (e.g. empty conversation) — that still counts as an ack
   * when no newer dirty arrived during the write.
   * Throw to fail — dirty stays set so a later flush can retry.
   */
  write: () => Promise<boolean>;
  isStreaming: () => boolean;
  throttleMs?: number;
  debounceMs?: number;
};

export type ConversationSaveQueue = {
  notifyDirty: () => void;
  flushNow: () => void;
  flushIfPending: () => void;
  isDirty: () => boolean;
  waitUntilIdle: () => Promise<void>;
  dispose: () => void;
};

/**
 * Per-conversation serialized autosave queue.
 *
 * Dirty/ack rule (in-flight N vs queued N+1):
 * - `notifyDirty` bumps `dirtyGeneration` and schedules a coalesced flush.
 * - A flush captures generation G at start and runs at most one in-flight write.
 * - If the conversation is dirtied again while G is in flight, `dirtyGeneration`
 *   advances (N+1) and a follow-up flush is required after G completes.
 * - Ack of G clears dirty only when `dirtyGeneration === G`. Ack of N must NOT
 *   clear dirty if N+1 is already queued.
 *
 * Assumes one writer per profile/database — no DB CAS.
 */
export function createConversationSaveQueue({
  write,
  isStreaming,
  throttleMs = STREAM_SAVE_THROTTLE_MS,
  debounceMs = IDLE_SAVE_DEBOUNCE_MS,
}: CreateConversationSaveQueueOptions): ConversationSaveQueue {
  let dirtyGeneration = 0;
  let ackedGeneration = 0;
  let inFlight: Promise<void> | null = null;
  let disposed = false;

  const isDirty = () => dirtyGeneration > ackedGeneration;

  const runFlush = () => {
    if (disposed) return;
    if (inFlight) return;
    if (!isDirty()) return;

    const generation = dirtyGeneration;

    inFlight = (async () => {
      try {
        await write();
        // WHY: ack of N must not clear dirty when N+1 was queued during the write.
        if (dirtyGeneration === generation) {
          ackedGeneration = generation;
        }
      } catch {
        // WHY: Stay dirty — ackedGeneration unchanged. Do not tight-loop retry;
        // the next `notifyDirty` (or an already-queued N+1 below) schedules again.
      } finally {
        inFlight = null;
        // WHY: only auto-continue when a newer dirty landed during this write.
        // A failed write at G without N+1 waits for the next touch.
        if (!disposed && dirtyGeneration > generation) {
          scheduler.schedule();
        }
      }
    })();
  };

  const scheduler = createSaveScheduler({
    flush: runFlush,
    throttleMs,
    debounceMs,
    isStreaming,
  });

  const notifyDirty = () => {
    if (disposed) return;
    dirtyGeneration += 1;
    scheduler.schedule();
  };

  const flushNow = () => {
    if (disposed) return;
    scheduler.flushNow();
  };

  const flushIfPending = () => {
    if (disposed) return;
    scheduler.flushIfPending();
  };

  const waitUntilIdle = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    // WHY: only wait on the in-flight write. Dirty-without-in-flight (scheduled
    // N+1 or a failed write) is driven by the caller via flushNow — polling
    // dirty here would microtask-spin when nothing is executing.
    return inFlight ?? Promise.resolve();
  };

  const dispose = () => {
    if (disposed) return;
    // WHY: flush any coalesced timer before locking the queue. `write` must
    // no-op when the conversation was removed from the store so this cannot
    // resurrect a deleted row.
    scheduler.flushIfPending();
    disposed = true;
  };

  return { notifyDirty, flushNow, flushIfPending, isDirty, waitUntilIdle, dispose };
}
