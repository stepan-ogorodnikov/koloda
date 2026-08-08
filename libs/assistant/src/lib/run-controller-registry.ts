import type { QueueCancelReason } from "./serial-queue";

/**
 * Engine-owned AbortController map keyed by runId.
 *
 * INVARIANT: Each in-flight run owns its own AbortController keyed by runId.
 * Lifetime is tied to the engine — not a React mount — so chat unmount does
 * not abort background runs.
 *
 * After dispose/close, beginRun must not create fresh controllers (shutdown
 * must not let a dequeued retry start a new provider call).
 *
 * Abort provenance: cancel/dispose record a requested termination cause so
 * AbortError classification can distinguish user cancel from shutdown/dispose
 * and from unrequested provider/transport aborts.
 */
export type RunAbortReason = QueueCancelReason;

export type RunControllerRegistry = {
  beginRun: (runId: string) => AbortController;
  endRun: (runId: string, controller: AbortController) => void;
  cancel: (runId: string, reason?: RunAbortReason) => void;
  /** Consume the requested abort cause for a run, if any. */
  takeAbortReason: (runId: string) => RunAbortReason | undefined;
  has: (runId: string) => boolean;
  dispose: (reason?: RunAbortReason) => void;
  readonly isClosed: boolean;
};

export function createRunControllerRegistry(): RunControllerRegistry {
  const controllers = new Map<string, AbortController>();
  // WHY: Kept after controller removal so the AbortError catch can still read
  // the requested cause after cancel()/dispose() delete the controller entry.
  const abortReasons = new Map<string, RunAbortReason>();
  let isClosed = false;

  return {
    get isClosed() {
      return isClosed;
    },

    beginRun(runId) {
      // INVARIANT: closed registry must not mint controllers for post-shutdown work.
      if (isClosed) {
        throw new Error("RunControllerRegistry is closed");
      }
      // WHY: Retry reuses runId; drop any leftover controller for that id first.
      // Do not stamp abort provenance — the new run has not been canceled.
      const existing = controllers.get(runId);
      if (existing) {
        abortReasons.delete(runId);
        existing.abort();
      }
      abortReasons.delete(runId);
      const controller = new AbortController();
      controllers.set(runId, controller);
      return controller;
    },
    endRun(runId, controller) {
      if (controllers.get(runId) === controller) {
        controllers.delete(runId);
      }
    },
    cancel(runId, reason: RunAbortReason = "user") {
      const controller = controllers.get(runId);
      if (!controller) return;
      abortReasons.set(runId, reason);
      controller.abort();
      controllers.delete(runId);
    },
    takeAbortReason(runId) {
      const reason = abortReasons.get(runId);
      if (reason === undefined) return undefined;
      abortReasons.delete(runId);
      return reason;
    },
    has(runId) {
      return controllers.has(runId);
    },
    dispose(reason: RunAbortReason = "dispose") {
      isClosed = true;
      for (const [runId, controller] of controllers) {
        abortReasons.set(runId, reason);
        controller.abort();
      }
      controllers.clear();
    },
  };
}
