/**
 * Engine-owned AbortController map keyed by runId.
 *
 * INVARIANT: Each in-flight run owns its own AbortController keyed by runId.
 * Lifetime is tied to the engine — not a React mount — so chat unmount does
 * not abort background runs.
 */
export type RunControllerRegistry = {
  beginRun: (runId: string) => AbortController;
  endRun: (runId: string, controller: AbortController) => void;
  cancel: (runId: string) => void;
  dispose: () => void;
};

export function createRunControllerRegistry(): RunControllerRegistry {
  const controllers = new Map<string, AbortController>();

  return {
    beginRun(runId) {
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
    dispose() {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    },
  };
}
