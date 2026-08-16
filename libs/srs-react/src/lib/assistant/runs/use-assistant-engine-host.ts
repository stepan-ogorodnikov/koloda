import type { CardGenerationRequest, ChatStreamRequest } from "@koloda/ai";
import { computeConversationTitle } from "@koloda/ai";
import type { Conversation, SetConversationData } from "@koloda/app";
import type { AssistantEngine, AssistantExecutionPort, ConversationPersistenceHost } from "@koloda/assistant";
import {
  createAssistantEngine,
  createConversationPersistenceHost,
  logAssistantStructured,
  SHUTDOWN_FLUSH_TIMEOUT_MS,
} from "@koloda/assistant";
import { aiRuntimeAtom } from "@koloda/core-react";
import type { createStore } from "jotai";
import { useStore } from "jotai";
import { useEffect } from "react";
import { toPersistedState } from "../persistence/conversation-persistence";
import { removeConversationAtom } from "../state/conversation-actions";
import type { SaveStatus } from "../state/conversation-store";
import {
  conversationsAtom,
  currentConversationIdAtom,
  dispatchToConversationOnStore,
  markReadIfCurrentOnStore,
  pendingSaveByConversationAtom,
  touchConversationOnStore,
  blockedConversationRestoreAtom,
  clearBlockedConversationRestore,
} from "../state/conversation-store";
import { assistantEventToReducerAction } from "./assistant-event-to-action";

type AssistantJotaiStore = ReturnType<typeof createStore>;

export type AssistantPersistenceWriteAdapter = {
  writeConversation: (conversationId: string) => Promise<boolean>;
};

// WHY: Persistence queues outlive any single React tree. The host keeps a
// mutable write adapter slot that route hooks register while mounted and
// clear on unmount — never an escaped Effect Event.
let persistenceWriteAdapter: AssistantPersistenceWriteAdapter | null = null;

let engineInstance: AssistantEngine | null = null;
let persistenceHostInstance: ConversationPersistenceHost | null = null;

function createEngineFromStore(store: AssistantJotaiStore): AssistantEngine {
  return createAssistantEngine({
    // INVARIANT: The port is fixed at the application-shell boundary. Each
    // command supplies only immutable non-secret identity; this host resolves
    // the current host-owned runtime and invokes it by that identity.
    executionPort: createAssistantExecutionPort(store),
    // WHY: Engine emits typed events; this adapter alone knows reducer tuples.
    emit: (event) => {
      dispatchToConversationOnStore(store, event.conversationId, assistantEventToReducerAction(event));
    },
    markReadIfCurrent: (id, runId) => {
      markReadIfCurrentOnStore(store, id, runId);
    },
    touch: (conversationId) => {
      touchConversationOnStore(store, conversationId);
    },
    isRunStreaming: (conversationId, runId) =>
      store.get(conversationsAtom)[conversationId]?.runs[runId]?.status === "streaming",
    // WHY: Engine/runtime must address conversations by id — never UI-current
    // `assistantConversationStateAtom` — so queued retry ownership cannot drift.
    readConversationState: (conversationId) => store.get(conversationsAtom)[conversationId] ?? { runs: {} },
  });
}

function createStreamRequestId(): string {
  return crypto.randomUUID();
}

function logStreamStart(conversationId: string, runId: string, requestId: string): void {
  // WHY: One correlation id per stream, minted at the host/AIRuntime boundary
  // so Electron IPC and structured logs share the same requestId. Never log
  // chunks, cards, message bodies, or profile secrets.
  logAssistantStructured({ conversationId, runId, requestId, commandOrEvent: "streamStart" });
}

function createAssistantExecutionPort(store: AssistantJotaiStore): AssistantExecutionPort {
  return {
    executeChat: (input, onChunk, signal) => {
      const requestId = createStreamRequestId();
      logStreamStart(input.conversationId, input.runId, requestId);
      return store
        .get(aiRuntimeAtom)
        .chat(
          input.identity.profileId,
          structuredClone(input.request) as ChatStreamRequest,
          onChunk,
          signal,
          requestId,
        );
    },
    executeGenerate: async (input, onCard, signal) => {
      const template = input.identity.template;
      if (!template) throw new Error("Card generation execution requires a template snapshot");

      const requestId = createStreamRequestId();
      logStreamStart(input.conversationId, input.runId, requestId);
      await store.get(aiRuntimeAtom).generateCards(
        input.identity.profileId,
        {
          template: structuredClone(template) as unknown as CardGenerationRequest["template"],
          input: structuredClone(input.request.input) as CardGenerationRequest["input"],
          messages: structuredClone(input.request.messages) as CardGenerationRequest["messages"],
          onCard,
          abortSignal: signal,
          systemPromptTemplate: input.request.systemPromptTemplate,
          dataContext: input.request.dataContext,
        },
        requestId,
      );
    },
  };
}

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

export function ensureAssistantEngine(store: AssistantJotaiStore): AssistantEngine {
  if (!engineInstance) engineInstance = createEngineFromStore(store);
  return engineInstance;
}

export function getAssistantEngine(): AssistantEngine {
  if (!engineInstance)
    throw new Error("AssistantEngine not initialized — mount useAssistantEngineHost at application-shell scope");
  return engineInstance;
}

/** Whether the application-shell persistence write adapter is registered. */
export function isAssistantPersistenceWriteAdapterReady(): boolean {
  return persistenceWriteAdapter != null;
}

/**
 * Register the React-side durable-write adapter for the engine persistence host.
 * Returns an unregister that clears the slot only if this registration is current.
 */
export function registerAssistantPersistenceWriteAdapter(adapter: AssistantPersistenceWriteAdapter): () => void {
  persistenceWriteAdapter = adapter;
  return () => {
    if (persistenceWriteAdapter === adapter) persistenceWriteAdapter = null;
  };
}

/**
 * Idempotent: wires the engine-owned persistence queue map to the store's
 * dirty counters. I/O goes through the registered write adapter slot.
 */
export function ensureAssistantPersistenceHost(store: AssistantJotaiStore): ConversationPersistenceHost {
  if (!persistenceHostInstance) {
    persistenceHostInstance = createConversationPersistenceHost({
      createWrite: (conversationId) => async () => {
        if (!isAssistantPersistenceWriteAdapterReady()) {
          // WHY: the shell registers in useLayoutEffect — reject until committed so
          // the save queue retries instead of acking a skipped write.
          throw new Error("Assistant persistence write adapter is not ready");
        }
        return persistenceWriteAdapter!.writeConversation(conversationId);
      },
      isStreaming: (conversationId) => store.get(conversationsAtom)[conversationId]?.activeRunId != null,
      getInitialPending: () => store.get(pendingSaveByConversationAtom),
      subscribePendingSaves: (listener) =>
        store.sub(pendingSaveByConversationAtom, () => {
          listener(store.get(pendingSaveByConversationAtom));
        }),
    });
    ensureAssistantEngine(store).setPersistenceHost(persistenceHostInstance);
  }
  return persistenceHostInstance;
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

export function resetAssistantEngineForTests(): void {
  engineInstance?.dispose();
  engineInstance = null;
  persistenceHostInstance = null;
  persistenceWriteAdapter = null;
}

/**
 * Application-shell engine host. Owns run AbortControllers, persistence
 * scheduling, and best-effort unload listeners so leaving the AI route does
 * not drop shutdown coordination or abort background runs. Mount on the app
 * shell (e.g. `App`), not the AI route.
 */
export function useAssistantEngineHost(): void {
  const store = useStore();

  ensureAssistantEngine(store);

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

export type BuildWriteConversationOptions = {
  store: AssistantJotaiStore;
  setConversationFn: (data: SetConversationData) => Promise<Conversation>;
  setSaveStatus: (status: SaveStatus) => void;
  setQueryConversation: (id: string, row: Conversation) => void;
  invalidateConversations: () => void;
  /** When true, skip the upsert — conversation is mid coordinated delete (#8). */
  isTombstoned: (conversationId: string) => boolean;
};

/** Shared durable-write adapter for the engine persistence host. */
export function buildWriteConversation({
  store,
  setConversationFn,
  setSaveStatus,
  setQueryConversation,
  invalidateConversations,
  isTombstoned,
}: BuildWriteConversationOptions): (conversationId: string) => Promise<boolean> {
  return async (id: string): Promise<boolean> => {
    if (isTombstoned(id)) return false;
    const state = store.get(conversationsAtom)[id];
    if (!state) return false;
    if (state.messages.length === 0 && state.activeRunId === null) return false;

    // WHY: persist the live snapshot as-is — including in-flight `streaming`
    // checkpoints. Restore converts orphaned streaming runs to
    // `interrupted`/`crash_recovery`. Do not rewrite streaming → canceled here;
    // only an explicit user cancel produces `canceled`/`user`.
    const persistState = toPersistedState(state);
    const title = computeConversationTitle(persistState);
    const data: SetConversationData = {
      id: persistState.id,
      // WHY: structuredClone detaches persistState from the Jotai store so the
      // async write below doesn't capture a reference the reducer will keep
      // mutating. Unlike JSON.parse(JSON.stringify(...)) it preserves Date
      // instances; serialization to the jsonb column happens at the DB layer.
      state: structuredClone(persistState),
      title,
      updatedAt: persistState.updatedAt,
    };

    // WHY: re-check after cloning — a delete can land between snapshot and write.
    if (isTombstoned(id) || !store.get(conversationsAtom)[id]) return false;

    try {
      const row = await setConversationFn(data);
      // WHY: coordinated delete may have finished while the upsert ran; do not
      // push a resurrected row into the query cache or store timestamps.
      if (isTombstoned(id) || !store.get(conversationsAtom)[id]) return false;
      const currentId = store.get(currentConversationIdAtom);
      if (currentId === row.id)
        setSaveStatus({
          conversationId: row.id,
          message: null,
          isDismissed: false,
        });
      setQueryConversation(row.id, row);
      invalidateConversations();
      const savedAt = row.updatedAt ? new Date(row.updatedAt) : null;
      if (savedAt) {
        dispatchToConversationOnStore(store, row.id, (prev) => {
          const prevAt = prev.updatedAt instanceof Date ? prev.updatedAt : null;
          if (prevAt && prevAt.getTime() >= savedAt.getTime()) return prev;
          return { ...prev, updatedAt: savedAt };
        });
      }
      return true;
    } catch (error) {
      console.error("Failed to save conversation", error);
      const currentId = store.get(currentConversationIdAtom);
      if (currentId === id) {
        setSaveStatus({
          conversationId: id,
          message: (error as Error).message,
          isDismissed: false,
        });
      }
      throw error;
    }
  };
}

export type DeleteAssistantConversationOptions = {
  store: AssistantJotaiStore;
  conversationId: string;
  deleteFromDb: (id: string) => Promise<unknown>;
  invalidateConversations: () => void;
  removeConversationQuery: (id: string) => void;
};

/**
 * Coordinated conversation delete (#8): provisional tombstone → cancel queued →
 * await in-flight write → DB delete → commit tombstone → dispose runtime
 * (while store still has runs) → drop store/query cache.
 *
 * On DB failure, rollback restores autosave so the conversation stays editable
 * and a later delete can succeed (#6).
 */
export async function deleteAssistantConversation({
  store,
  conversationId,
  deleteFromDb,
  invalidateConversations,
  removeConversationQuery,
}: DeleteAssistantConversationOptions): Promise<void> {
  const host = ensureAssistantPersistenceHost(store);
  const engine = ensureAssistantEngine(store);

  const deletion = await host.beginDelete(conversationId);
  try {
    await deleteFromDb(conversationId);
    deletion.commit();
  } catch (error) {
    // WHY: failed DB delete must not leave a permanent host tombstone — the
    // conversation stays in the store/UI and subsequent edits must autosave (#6).
    deletion.rollback();
    throw error;
  }
  // WHY: dispose while store still has run keys — cancel loop reads
  // readConversationState; clearing first leaves empty runs and never aborts (#8).
  // INVARIANT: only after successful commit — failure must not dispose/remove.
  engine.disposeConversation(conversationId);
  store.set(removeConversationAtom, conversationId);
  // WHY: A blocked row (unsupportedVersion/corrupt) is never in the store, so
  // removeConversationAtom cannot clean it up — clear the recovery entry here
  // so a deleted id cannot linger as blocked.
  store.set(blockedConversationRestoreAtom, (prev) => clearBlockedConversationRestore(prev, conversationId));
  invalidateConversations();
  removeConversationQuery(conversationId);
}
