/**
 * Engine-owned AbortController map keyed by runId.
 *
 * INVARIANT: Each in-flight run owns its own AbortController keyed by runId.
 * Lifetime is tied to the engine — not a React mount — so chat unmount does
 * not abort background runs.
 *
 * After dispose/close, beginRun must not create fresh controllers (shutdown
 * must not let a dequeued retry start a new provider call).
 */
export type RunControllerRegistry = {
  beginRun: (runId: string) => AbortController;
  endRun: (runId: string, controller: AbortController) => void;
  cancel: (runId: string) => void;
  has: (runId: string) => boolean;
  dispose: () => void;
  readonly isClosed: boolean;
};

export function createRunControllerRegistry(): RunControllerRegistry {
  const controllers = new Map<string, AbortController>();
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
      controllers.get(runId)?.abort();
      const controller = new AbortController();
      controllers.set(runId, controller);
      return controller;
    },
    endRun(runId, controller) {
      if (controllers.get(runId) === controller) {
        controllers.delete(runId);
      }
    },
    cancel(runId) {
      const controller = controllers.get(runId);
      if (!controller) return;
      controller.abort();
      controllers.delete(runId);
    },
    has(runId) {
      return controllers.has(runId);
    },
    dispose() {
      isClosed = true;
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    },
  };
}
