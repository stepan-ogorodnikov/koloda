import { shutdownAssistantGracefully } from "@koloda/srs-react";
import type { createStore } from "jotai";

// INVARIANT: Channel names must match apps/native-electron/src/window-close-coordinator.ts.
const APP_SHUTDOWN_REQUEST_CHANNEL = "app:shutdown-request";
const APP_SHUTDOWN_ACK_CHANNEL = "app:shutdown-ack";

type AssistantJotaiStore = ReturnType<typeof createStore>;

type ElectronCloseApi = {
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
};

/**
 * Electron-only: main sends `app:shutdown-request` on window close; renderer
 * runs `shutdownAssistantGracefully` then acks so main can allow close.
 * No-op when `window.electronAPI` is missing (demo/browser hosts).
 */
export function installElectronCloseCoordination(store: AssistantJotaiStore): () => void {
  const api = (globalThis as { window?: { electronAPI?: ElectronCloseApi } }).window?.electronAPI;
  if (!api?.on || !api.invoke) return () => {};

  let isShuttingDown = false;

  return api.on(APP_SHUTDOWN_REQUEST_CHANNEL, () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    void (async () => {
      try {
        await shutdownAssistantGracefully(store);
      } catch {
        // WHY: Still ack so main can close; persistence already logged flush failures.
      } finally {
        try {
          await api.invoke(APP_SHUTDOWN_ACK_CHANNEL);
        } catch {
          // WORKAROUND: Invoke can reject if the window is already tearing down.
        }
      }
    })();
  });
}
