import { createConversationSaveQueue } from "./create-conversation-save-queue";
import type { ConversationSaveQueue } from "./create-conversation-save-queue";

/** Best-effort ceiling for in-flight durable writes during graceful shutdown. */
export const SHUTDOWN_FLUSH_TIMEOUT_MS = 2000;

export type CreateConversationPersistenceHostOptions = {
  createWrite: (conversationId: string) => () => Promise<boolean>;
  isStreaming: (conversationId: string) => boolean;
  getInitialPending: () => Record<string, number>;
  subscribePendingSaves: (listener: (pending: Record<string, number>) => void) => () => void;
};

export type ConversationPersistenceHost = {
  flushAllNow: () => void;
  flushAllBounded: (timeoutMs?: number) => Promise<void>;
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

  const flushAllBounded = async (timeoutMs = SHUTDOWN_FLUSH_TIMEOUT_MS): Promise<void> => {
    if (disposed) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // WHY: kick scheduled N+1 flushes each iteration — waitUntilIdle only
      // blocks on in-flight writes, not on dirty-without-in-flight.
      flushAllNow();
      const waits = [...queues.values()].map((queue) => queue.waitUntilIdle());
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await Promise.race([
        Promise.all(waits),
        new Promise<void>((resolve) => {
          setTimeout(resolve, remaining);
        }),
      ]);
      const stillDirty = [...queues.values()].some((queue) => queue.isDirty());
      if (!stillDirty) break;
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

  return { flushAllNow, flushAllBounded, dispose };
}
