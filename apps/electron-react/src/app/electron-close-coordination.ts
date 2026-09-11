import { shutdownAssistantGracefully } from "@koloda/assistant-react";
import { APP_SHUTDOWN_ACK_CHANNEL, APP_SHUTDOWN_REQUEST_CHANNEL } from "@koloda/native-ipc";
import type { createStore } from "jotai";

type AssistantJotaiStore = ReturnType<typeof createStore>;

type ElectronCloseApi = {
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
};

/**
 * Electron-only: main sends `app:shutdown-request` on window close; renderer
 * runs `shutdownAssistantGracefully` then acks so main can allow close.
 * Awaits the engine single-flight promise, so an unload-started flush is joined
 * before ack. No-op when `window.electronAPI` is missing (web/browser hosts).
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
