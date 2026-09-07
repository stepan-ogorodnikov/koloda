// WHY: Renderer `pagehide`/`beforeunload` promises are not awaited by Electron.
// Main owns a bounded close handshake so `app_shutdown` flush can finish.

/** Main → renderer: begin interrupt + bounded persistence flush. */
export const APP_SHUTDOWN_REQUEST_CHANNEL = "app:shutdown-request";

/** Renderer → main: interrupt + flush settled (or bounded flush timed out in renderer). */
export const APP_SHUTDOWN_ACK_CHANNEL = "app:shutdown-ack";

// WHY: Align with `@koloda/assistant` `SHUTDOWN_FLUSH_TIMEOUT_MS` (2000) plus IPC slack
// so main does not force-destroy before the renderer flush deadline.
export const WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS = 2500;

export type WindowCloseCoordinatorHooks = {
  requestRendererShutdown: () => void;
  closeWindow: () => void;
  forceCloseWindow: () => void;
  timeoutMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
};

export type WindowCloseCoordinator = {
  onCloseAttempt(): "allow" | "defer";
  onShutdownAck(): void;
  dispose(): void;
};

export function createWindowCloseCoordinator(hooks: WindowCloseCoordinatorHooks): WindowCloseCoordinator {
  let phase: "idle" | "awaiting_ack" | "closing" = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutMs = hooks.timeoutMs ?? WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS;
  const setTimeoutFn = hooks.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = hooks.clearTimeoutFn ?? clearTimeout;

  const clearTimer = () => {
    if (timer == null) return;
    clearTimeoutFn(timer);
    timer = null;
  };

  const beginClosing = (shouldForceClose: boolean) => {
    if (phase === "closing") return;
    phase = "closing";
    clearTimer();
    if (shouldForceClose) {
      hooks.forceCloseWindow();
    } else {
      hooks.closeWindow();
    }
  };

  return {
    onCloseAttempt() {
      if (phase === "closing") return "allow";
      // INVARIANT: Extra close clicks while flushing stay deferred until ack/deadline.
      if (phase === "awaiting_ack") return "defer";
      phase = "awaiting_ack";
      hooks.requestRendererShutdown();
      timer = setTimeoutFn(() => {
        timer = null;
        beginClosing(true);
      }, timeoutMs);

      return "defer";
    },
    onShutdownAck() {
      if (phase !== "awaiting_ack") return;
      beginClosing(false);
    },
    dispose() {
      clearTimer();
      phase = "closing";
    },
  };
}
