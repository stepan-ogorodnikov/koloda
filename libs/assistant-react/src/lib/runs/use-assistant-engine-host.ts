import { invalidateDeckQueriesAfterAddDeck, registerAddDeckQueryInvalidator } from "./add-deck-query-invalidation";
import { ensureAssistantEngine } from "./assistant-engine-instance";
import type { AssistantJotaiStore } from "./assistant-engine-instance";
import { SHUTDOWN_FLUSH_TIMEOUT_MS } from "@koloda/assistant";
import {
  conversationsAtom,
  dispatchToConversationOnStore,
  touchConversationOnStore,
} from "../state/conversation-store";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "jotai";

function interruptAllStreamingRuns(store: AssistantJotaiStore): void {
  const conversations = store.get(conversationsAtom);
  for (const [conversationId, state] of Object.entries(conversations)) {
    for (const [runId, run] of Object.entries(state.runs)) {
      if (run.status !== "streaming") continue;
      dispatchToConversationOnStore(store, conversationId, ["interruptRun", { runId, reason: "app_shutdown" }]);
      touchConversationOnStore(store, conversationId);
    }
  }
}

export function shutdownAssistantGracefully(
  store: AssistantJotaiStore,
  flushTimeoutMs = SHUTDOWN_FLUSH_TIMEOUT_MS,
): Promise<void> {
  return ensureAssistantEngine(store).dispatch({
    type: "shutdown",
    input: {
      interruptActiveRuns: () => interruptAllStreamingRuns(store),
      flushTimeoutMs,
    },
  }) as Promise<void>;
}

/**
 * Application-shell engine host. Owns run AbortControllers, persistence
 * scheduling, and best-effort unload listeners so leaving the AI route does
 * not drop shutdown coordination or abort background runs. Mount on the app
 * shell (e.g. `App`), not the AI route.
 *
 * Engine/persistence singletons and the execution port live in
 * `assistant-engine-instance.ts` / `assistant-persistence-host.ts` /
 * `assistant-execution-port.ts`; durable-write + delete orchestration in
 * `persistence/conversation-write-adapter.ts`.
 */
export function useAssistantEngineHost(): void {
  const store = useStore();
  const queryClient = useQueryClient();

  ensureAssistantEngine(store);

  // WHY: add_deck writes SQLite from the host binder, outside React Query.
  // This shell outlives the AI route, so a deck created in the background
  // still refreshes a mounted decks list and the template/preset delete guards.
  // The callback stays stable; the ref picks up a replaced QueryClient.
  const queryClientRef = useRef(queryClient);
  useLayoutEffect(() => {
    queryClientRef.current = queryClient;
  });
  useLayoutEffect(() => {
    return registerAddDeckQueryInvalidator(() => {
      invalidateDeckQueriesAfterAddDeck(queryClientRef.current);
    });
  }, []);

  useEffect(() => {
    // WORKAROUND: Browser `pagehide`/`beforeunload` are best-effort — the
    // platform does not await flush promises. Electron hosts also install a
    // main-process close handshake (`installElectronCloseCoordination`) that
    // awaits this same `shutdownAssistantGracefully` (engine single-flight) so
    // IPC acknowledgement joins an unload-started flush instead of acking early.
    const onShutdown = (event: Event) => {
      // WHY: bfcache freezes the page with the React tree and singleton engine
      // intact (`pagehide` with `persisted === true`). Terminal shutdown would
      // leave a closed engine that cannot accept new runs after `pageshow`.
      // Real unload still uses plain Event / `persisted === false`.
      if (event instanceof PageTransitionEvent && event.persisted) return;
      void shutdownAssistantGracefully(store);
    };
    window.addEventListener("pagehide", onShutdown);
    window.addEventListener("beforeunload", onShutdown);
    return () => {
      window.removeEventListener("pagehide", onShutdown);
      window.removeEventListener("beforeunload", onShutdown);
      // INVARIANT: AI-route/chat unmount must not dispose engine or persistence queues.
    };
  }, [store]);
}
