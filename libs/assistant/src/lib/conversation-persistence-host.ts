import { createConversationSaveQueue, SAVE_RETRY_BASE_DELAY_MS } from "./create-conversation-save-queue";
import type { ConversationSaveQueue } from "./create-conversation-save-queue";

/** Best-effort ceiling for in-flight durable writes during graceful shutdown. */
export const SHUTDOWN_FLUSH_TIMEOUT_MS = 2000;

/**
 * Max write attempts per conversation during `flushAllBounded`.
 * Prevents a tight rejection loop when the store rejects instantly.
 */
export const SHUTDOWN_SAVE_MAX_ATTEMPTS = 3;

export type CreateConversationPersistenceHostOptions = {
  createWrite: (conversationId: string) => () => Promise<boolean>;
  isStreaming: (conversationId: string) => boolean;
  getInitialPending: () => Record<string, number>;
  subscribePendingSaves: (listener: (pending: Record<string, number>) => void) => () => void;
};

export type ConversationPersistenceHost = {
  flushAllNow: () => void;
  flushAllBounded: (timeoutMs?: number) => Promise<void>;
  /** Immediate save attempt for a conversation (cancels pending backoff). */
  retrySave: (conversationId: string) => void;
  dispose: () => void;
};

/**
 * Engine-owned per-conversation save queue map. Lifetime is tied to the
 * assistant engine — not a mounted chat — so route/chat unmount does not
 * drop pending flushes for background conversations.
 */
export function createConversationPersistenceHost({
  createWrite,
  isStreaming,
  getInitialPending,
  subscribePendingSaves,
}: CreateConversationPersistenceHostOptions): ConversationPersistenceHost {
  const queues = new Map<string, ConversationSaveQueue>();
  let prevPending: Record<string, number> = { ...getInitialPending() };
  let disposed = false;

  const getQueue = (id: string): ConversationSaveQueue => {
    let queue = queues.get(id);
    if (!queue) {
      queue = createConversationSaveQueue({
        conversationId: id,
        write: createWrite(id),
        isStreaming: () => isStreaming(id),
      });
      queues.set(id, queue);
    }
    return queue;
  };

  const syncFromPending = (next: Record<string, number>) => {
    if (disposed) return;
    for (const [id, count] of Object.entries(next)) {
      if (count > (prevPending[id] ?? 0)) {
        getQueue(id).notifyDirty();
      }
    }
    for (const id of Object.keys(prevPending)) {
      if (!(id in next)) {
        queues.get(id)?.dispose();
        queues.delete(id);
      }
    }
    prevPending = next;
  };

  // WHY: catch dirties that landed before this host subscribed (e.g. clone
  // while the route was mounting). One notify per already-pending id is
  // enough — the queue always persists the latest snapshot.
  for (const [id, count] of Object.entries(prevPending)) {
    if (count > 0) getQueue(id).notifyDirty();
  }

  const unsub = subscribePendingSaves(syncFromPending);

  const flushAllNow = () => {
    if (disposed) return;
    for (const queue of queues.values()) {
      queue.flushNow();
    }
  };

  const retrySave = (conversationId: string) => {
    if (disposed) return;
    queues.get(conversationId)?.flushNow();
  };

  const flushAllBounded = async (timeoutMs = SHUTDOWN_FLUSH_TIMEOUT_MS): Promise<void> => {
    if (disposed) return;
    const deadline = Date.now() + timeoutMs;
    // WHY: count failures for this flushAllBounded call only — lifetime
    // consecutiveFailures must not starve exit flushes after earlier autosave
    // failures, and must not be used as a delta (it resets to 0 on ack, which
    // would make the attempt cap and failure yield stop working after a
    // mid-flush success with N+1 still dirty).
    const flushFailures = new Map<string, number>();
    const failuresDuringFlush = (id: string) => flushFailures.get(id) ?? 0;

    while (Date.now() < deadline) {
      // id → consecutiveFailures() immediately before flushNow for this round.
      const preFlushConsecutive = new Map<string, number>();
      // WHY: kick scheduled / backoff flushes each iteration — waitUntilIdle only
      // blocks on in-flight writes, not on dirty-without-in-flight.
      for (const [id, queue] of queues.entries()) {
        if (!queue.isDirty()) continue;
        // INVARIANT: stop re-issuing writes for a conversation once it has
        // failed SHUTDOWN_SAVE_MAX_ATTEMPTS times during this shutdown flush.
        if (failuresDuringFlush(id) >= SHUTDOWN_SAVE_MAX_ATTEMPTS) continue;
        preFlushConsecutive.set(id, queue.consecutiveFailures());
        queue.flushNow();
      }

      const waits = [...queues.values()].map((queue) => queue.waitUntilIdle());
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await Promise.race([
        Promise.all(waits),
        new Promise<void>((resolve) => {
          setTimeout(resolve, remaining);
        }),
      ]);

      for (const [id, before] of preFlushConsecutive) {
        const queue = queues.get(id);
        if (!queue) continue;
        // WHY: consecutiveFailures resets to 0 on successful ack — only count
        // this wait as a flush failure when the counter rose (write threw).
        if (queue.consecutiveFailures() > before) flushFailures.set(id, failuresDuringFlush(id) + 1);
      }

      const stillRetrying = [...queues.entries()].some(
        ([id, queue]) => queue.isDirty() && failuresDuringFlush(id) < SHUTDOWN_SAVE_MAX_ATTEMPTS,
      );
      // WHY: shutdown drives retries via this loop — cancel ordinary backoff so
      // a timer cannot sneak an uncapped write during a failure yield, and so a
      // capped/failed flush does not keep firing after we stop.
      for (const queue of queues.values()) {
        queue.cancelRetry();
      }
      if (!stillRetrying) break;

      const needsFailureYield = [...queues.entries()].some(
        ([id, queue]) =>
          queue.isDirty() && failuresDuringFlush(id) > 0 && failuresDuringFlush(id) < SHUTDOWN_SAVE_MAX_ATTEMPTS,
      );
      // WHY: yield only after failures so a rejecting store cannot tight-loop;
      // successful in-flight N with queued N+1 must flush on the next iteration
      // without burning the shutdown deadline on backoff.
      if (!needsFailureYield) continue;

      const yieldMs = Math.min(SAVE_RETRY_BASE_DELAY_MS, deadline - Date.now());
      if (yieldMs <= 0) break;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, yieldMs);
      });
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsub();
    for (const queue of queues.values()) {
      queue.dispose();
    }
    queues.clear();
  };

  return { flushAllNow, flushAllBounded, retrySave, dispose };
}
