import { createSaveScheduler, IDLE_SAVE_DEBOUNCE_MS, STREAM_SAVE_THROTTLE_MS } from "./create-save-scheduler";
import { logAssistantStructured } from "./assistant-observability";

/** Base delay for the first autosave retry after a failed write. */
export const SAVE_RETRY_BASE_DELAY_MS = 250;
/** Ceiling for exponential autosave retry delay (jitter applied below this). */
export const SAVE_RETRY_MAX_DELAY_MS = 30_000;

export type SaveErrorCategory = "aborted" | "network" | "storage" | "unknown";

export type SaveFailureLog = {
  conversationId: string;
  generation: number;
  attempt: number;
  errorCategory: SaveErrorCategory;
  message: string;
};

export type CreateConversationSaveQueueOptions = {
  conversationId: string;
  /**
   * Perform the durable write for the latest snapshot.
   * Return `false` to skip (e.g. empty conversation) — that still counts as an ack
   * when no newer dirty arrived during the write.
   * Throw to fail — dirty stays set and a bounded backoff retry is scheduled.
   */
  write: () => Promise<boolean>;
  isStreaming: () => boolean;
  throttleMs?: number;
  debounceMs?: number;
  /** Injected for deterministic backoff tests. Defaults to `Math.random`. */
  random?: () => number;
  /** Injected for assertions; defaults to structured `[assistant.transition]` logging. */
  logSaveFailure?: (entry: SaveFailureLog) => void;
};

export type ConversationSaveQueue = {
  notifyDirty: () => void;
  flushNow: () => void;
  flushIfPending: () => void;
  isDirty: () => boolean;
  /** Consecutive failed writes since the last successful ack. */
  consecutiveFailures: () => number;
  /** Cancel a pending backoff retry without disposing the queue. */
  cancelRetry: () => void;
  waitUntilIdle: () => Promise<void>;
  /**
   * Tombstone this conversation's save queue for coordinated delete:
   * block new saves, cancel queued work, await the in-flight write.
   */
  prepareDelete: () => Promise<void>;
  isTombstoned: () => boolean;
  dispose: () => void;
};

/**
 * Bounded exponential backoff with full-jitter for ordinary autosave retries.
 * `attempt` is 1-based (first failure → attempt 1).
 */
export function computeSaveRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(SAVE_RETRY_MAX_DELAY_MS, SAVE_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  // WHY: full jitter (0.5–1.0×) spreads retries across clients without collapsing to zero delay.
  const jitter = 0.5 + random() * 0.5;
  return Math.floor(exp * jitter);
}

export function categorizeSaveError(error: unknown): SaveErrorCategory {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "aborted";
    const text = `${error.name} ${error.message}`;
    if (/network|fetch|ECONN|ENOTFOUND|ETIMEDOUT|timeout/i.test(text)) return "network";
    if (/quota|disk|SQLITE|PGlite|IndexedDB|storage/i.test(text)) return "storage";
  }
  return "unknown";
}

function defaultLogSaveFailure(entry: SaveFailureLog): void {
  logAssistantStructured({
    conversationId: entry.conversationId,
    commandOrEvent: "saveFailed",
    saveGeneration: entry.generation,
    retryAttempt: entry.attempt,
    errorCategory: entry.errorCategory,
  });
  console.error("[assistant.save]", entry);
}

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
 * - A failed write stays dirty and schedules a bounded backoff retry; delete
 *   tombstones via `prepareDelete` (cancel timers, await in-flight) before the
 *   DB row is removed so an upsert cannot resurrect it (#8).
 *
 * Assumes one writer per profile/database — no DB CAS.
 */
export function createConversationSaveQueue({
  conversationId,
  write,
  isStreaming,
  throttleMs = STREAM_SAVE_THROTTLE_MS,
  debounceMs = IDLE_SAVE_DEBOUNCE_MS,
  random = Math.random,
  logSaveFailure = defaultLogSaveFailure,
}: CreateConversationSaveQueueOptions): ConversationSaveQueue {
  let dirtyGeneration = 0;
  let ackedGeneration = 0;
  let inFlight: Promise<void> | null = null;
  let disposed = false;
  let tombstoned = false;
  let failureAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const isDirty = () => dirtyGeneration > ackedGeneration;
  const consecutiveFailures = () => failureAttempt;
  const isTombstoned = () => tombstoned;

  const clearRetryTimer = () => {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = () => {
    if (disposed || tombstoned) return;
    clearRetryTimer();
    const delay = computeSaveRetryDelayMs(failureAttempt, random);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      runFlush();
    }, delay);
  };

  const runFlush = () => {
    if (disposed || tombstoned) return;
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
        failureAttempt = 0;
        clearRetryTimer();
      } catch (error) {
        failureAttempt += 1;
        logSaveFailure({
          conversationId,
          generation,
          attempt: failureAttempt,
          errorCategory: categorizeSaveError(error),
          message: error instanceof Error ? error.message : String(error),
        });
        // WHY: Stay dirty — ackedGeneration unchanged. Retry via backoff rather
        // than waiting for another mutation (idle users would otherwise never save).
        if (!disposed && !tombstoned && dirtyGeneration === generation) scheduleRetry();
      } finally {
        inFlight = null;
        // WHY: a newer dirty during this write supersedes backoff — resume via
        // the normal throttle/debounce scheduler.
        if (!disposed && !tombstoned && dirtyGeneration > generation) {
          clearRetryTimer();
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
    if (disposed || tombstoned) return;
    dirtyGeneration += 1;
    // WHY: a fresh mutation cancels a pending backoff so the coalesced save
    // follows throttle/debounce instead of an outdated retry delay.
    clearRetryTimer();
    scheduler.schedule();
  };

  const flushNow = () => {
    if (disposed || tombstoned) return;
    // WHY: manual retry and shutdown must not wait out the backoff timer.
    clearRetryTimer();
    scheduler.flushNow();
  };

  const flushIfPending = () => {
    if (disposed || tombstoned) return;
    scheduler.flushIfPending();
  };

  const cancelRetry = () => {
    clearRetryTimer();
  };

  const waitUntilIdle = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    // WHY: only wait on the in-flight write. Dirty-without-in-flight (scheduled
    // N+1, backoff retry, or a failed write) is driven by timers / flushNow —
    // polling dirty here would microtask-spin when nothing is executing.
    return inFlight ?? Promise.resolve();
  };

  const prepareDelete = async (): Promise<void> => {
    if (disposed) return;
    // INVARIANT: tombstone first so notifyDirty / flush / retry cannot start
    // a write that races the upcoming DB delete (#8).
    tombstoned = true;
    clearRetryTimer();
    // WHY: drop coalesced work without flushing — a late upsert after delete
    // would recreate the row via unconditional onConflictDoUpdate.
    scheduler.cancel();
    // WHY: clear dirty so an in-flight ack path cannot schedule N+1 after we
    // finish waiting.
    ackedGeneration = dirtyGeneration;
    await (inFlight ?? Promise.resolve());
  };

  const dispose = () => {
    if (disposed) return;
    // WHY: delete cancels via prepareDelete; host/engine dispose must not
    // flushIfPending or a timer-fired write can resurrect a removed row.
    clearRetryTimer();
    scheduler.cancel();
    tombstoned = true;
    disposed = true;
  };

  return {
    notifyDirty,
    flushNow,
    flushIfPending,
    isDirty,
    consecutiveFailures,
    cancelRetry,
    waitUntilIdle,
    prepareDelete,
    isTombstoned,
    dispose,
  };
}
