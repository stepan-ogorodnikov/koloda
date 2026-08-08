/**
 * Serializes async work so each task starts only after the prior one settles
 * (success or failure). Used per conversation runtime for run commands.
 *
 * Closable: pending entries can be canceled by run id with explicit provenance,
 * and close() rejects further enqueues while canceling everything still queued.
 */

export type QueueCancelReason = "user" | "app_shutdown" | "dispose";

export class QueueClosedError extends Error {
  readonly reason: QueueCancelReason;

  constructor(reason: QueueCancelReason) {
    super(`Serial queue is closed (${reason})`);
    this.name = "QueueClosedError";
    this.reason = reason;
  }
}

type QueueEntry<T> = {
  runId: string;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  cancelReason: QueueCancelReason | null;
  settled: boolean;
};

export type SerialQueue<T = void> = {
  enqueue: (runId: string, task: () => Promise<T>) => Promise<T>;
  cancel: (runId: string, reason: QueueCancelReason) => boolean;
  close: (reason: QueueCancelReason) => string[];
  readonly isClosed: boolean;
};

export function createSerialQueue<T = void>(): SerialQueue<T> {
  let tail: Promise<void> = Promise.resolve();
  let closed: QueueCancelReason | null = null;
  let entrySeq = 0;
  const pending = new Map<string, QueueEntry<T>>();

  const settleCanceled = (entry: QueueEntry<T>, reason: QueueCancelReason) => {
    if (entry.settled) return;
    entry.settled = true;
    entry.cancelReason = reason;
    // WHY: Callers treat cancel-before-start like an aborted in-flight run —
    // resolve so awaiters do not see a rejection for intentional cancel.
    entry.resolve(undefined as T);
  };

  return {
    get isClosed() {
      return closed != null;
    },

    enqueue(runId, task) {
      if (closed != null) {
        return Promise.reject(new QueueClosedError(closed));
      }

      const entryKey = `${runId}:${entrySeq++}`;

      return new Promise<T>((resolve, reject) => {
        const entry: QueueEntry<T> = {
          runId,
          task,
          resolve,
          reject,
          cancelReason: null,
          settled: false,
        };
        pending.set(entryKey, entry);

        tail = tail.then(async () => {
          pending.delete(entryKey);
          if (entry.settled) return;

          if (entry.cancelReason != null || closed != null) {
            settleCanceled(entry, entry.cancelReason ?? closed!);
            return;
          }

          try {
            const value = await entry.task();
            if (!entry.settled) {
              entry.settled = true;
              entry.resolve(value);
            }
          } catch (error) {
            if (!entry.settled) {
              entry.settled = true;
              entry.reject(error);
            }
          }
        });
      });
    },

    cancel(runId, reason) {
      let found = false;
      for (const [key, entry] of pending) {
        if (entry.runId !== runId || entry.settled) continue;
        settleCanceled(entry, reason);
        pending.delete(key);
        found = true;
      }
      return found;
    },

    close(reason) {
      if (closed != null) return [];
      closed = reason;
      const runIds: string[] = [];
      const seen = new Set<string>();
      for (const entry of pending.values()) {
        settleCanceled(entry, reason);
        if (!seen.has(entry.runId)) {
          seen.add(entry.runId);
          runIds.push(entry.runId);
        }
      }
      pending.clear();
      return runIds;
    },
  };
}
