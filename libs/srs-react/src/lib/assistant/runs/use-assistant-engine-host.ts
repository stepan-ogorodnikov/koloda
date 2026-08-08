import { computeConversationTitle } from "@koloda/ai";
import type { ChatStreamGenerator } from "@koloda/ai";
import { createAssistantEngine, createConversationPersistenceHost, SHUTDOWN_FLUSH_TIMEOUT_MS } from "@koloda/assistant";
import type { AssistantEngine, CardGenerationExecutor, ConversationPersistenceHost } from "@koloda/assistant";
import type { Conversation, SetConversationData } from "@koloda/app";
import { useStore } from "jotai";
import type { createStore } from "jotai";
import { useEffect } from "react";
import { toPersistedState } from "../persistence/conversation-persistence";
import type { ConversationReducerAction } from "../state/conversation-reducer";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  currentConversationIdAtom,
  dispatchToConversationOnStore,
  markReadIfCurrentOnStore,
  pendingSaveByConversationAtom,
  touchConversationOnStore,
} from "../state/conversation-store";
import type { SaveStatus } from "../state/conversation-store";

type AssistantJotaiStore = ReturnType<typeof createStore>;

export type AssistantEngineTransports = {
  chatStreamGenerator: ChatStreamGenerator;
  streamGenerator: CardGenerationExecutor;
};

export type AssistantPersistenceWriteAdapter = {
  writeConversation: (conversationId: string) => Promise<boolean>;
};

const transportRef: {
  chatStreamGenerator: ChatStreamGenerator | null;
  streamGenerator: CardGenerationExecutor | null;
} = {
  chatStreamGenerator: null,
  streamGenerator: null,
};

// WHY: Persistence queues outlive any single React tree. The host keeps a
// mutable write adapter slot that route hooks register while mounted and
// clear on unmount — never an escaped Effect Event.
let persistenceWriteAdapter: AssistantPersistenceWriteAdapter | null = null;

let engineInstance: AssistantEngine<ConversationReducerAction> | null = null;
let persistenceHostInstance: ConversationPersistenceHost | null = null;

function createEngineFromStore(store: AssistantJotaiStore): AssistantEngine<ConversationReducerAction> {
  return createAssistantEngine<ConversationReducerAction>({
    getChatStreamGenerator: () => transportRef.chatStreamGenerator!,
    getStreamGenerator: () => transportRef.streamGenerator!,
    dispatch: (action) => {
      store.set(assistantConversationStateAtom, action);
      const currentId = store.get(currentConversationIdAtom);
      if (currentId) touchConversationOnStore(store, currentId);
    },
    dispatchToConversation: (id, action) => {
      dispatchToConversationOnStore(store, id, action);
    },
    markReadIfCurrent: (id, runId) => {
      markReadIfCurrentOnStore(store, id, runId);
    },
    touch: (conversationId) => {
      touchConversationOnStore(store, conversationId);
    },
    isRunStreaming: (conversationId, runId) =>
      store.get(conversationsAtom)[conversationId]?.runs[runId]?.status === "streaming",
    readState: () => store.get(assistantConversationStateAtom),
  });
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

export function ensureAssistantEngine(store: AssistantJotaiStore): AssistantEngine<ConversationReducerAction> {
  if (!engineInstance) {
    engineInstance = createEngineFromStore(store);
  }
  return engineInstance;
}

export function getAssistantEngine(): AssistantEngine<ConversationReducerAction> {
  if (!engineInstance) {
    throw new Error("AssistantEngine not initialized — mount useAssistantEngineHost at route scope");
  }
  return engineInstance;
}

export function registerAssistantEngineTransports(transports: AssistantEngineTransports): void {
  transportRef.chatStreamGenerator = transports.chatStreamGenerator;
  transportRef.streamGenerator = transports.streamGenerator;
}

/**
 * Register the React-side durable-write adapter for the engine persistence host.
 * Returns an unregister that clears the slot only if this registration is current.
 */
export function registerAssistantPersistenceWriteAdapter(adapter: AssistantPersistenceWriteAdapter): () => void {
  persistenceWriteAdapter = adapter;
  return () => {
    if (persistenceWriteAdapter === adapter) {
      persistenceWriteAdapter = null;
    }
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
        const write = persistenceWriteAdapter?.writeConversation;
        if (!write) {
          throw new Error("Assistant persistence write adapter is not registered");
        }
        return write(conversationId);
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
  return ensureAssistantEngine(store).shutdownGracefully({
    interruptActiveRuns: () => interruptAllStreamingRuns(store),
    flushTimeoutMs,
  });
}

export function resetAssistantEngineForTests(): void {
  engineInstance?.dispose();
  engineInstance = null;
  persistenceHostInstance = null;
  persistenceWriteAdapter = null;
  transportRef.chatStreamGenerator = null;
  transportRef.streamGenerator = null;
}

/**
 * Route-scoped engine host. Owns run AbortControllers, persistence scheduling,
 * and graceful shutdown so chat unmount does not abort background runs or
 * dispose save queues. Mount above `AssistantChat`.
 */
export function useAssistantEngineHost(): void {
  const store = useStore();

  ensureAssistantEngine(store);

  useEffect(() => {
    const onShutdown = () => {
      void shutdownAssistantGracefully(store);
    };
    window.addEventListener("pagehide", onShutdown);
    window.addEventListener("beforeunload", onShutdown);
    return () => {
      window.removeEventListener("pagehide", onShutdown);
      window.removeEventListener("beforeunload", onShutdown);
      // INVARIANT: route/chat unmount must not dispose engine or persistence queues.
    };
  }, [store]);
}

export type BuildWriteConversationOptions = {
  store: AssistantJotaiStore;
  setConversationFn: (data: SetConversationData) => Promise<Conversation>;
  setSaveStatus: (status: SaveStatus) => void;
  setQueryConversation: (id: string, row: Conversation) => void;
  invalidateConversations: () => void;
};

/** Shared durable-write adapter for the engine persistence host. */
export function buildWriteConversation({
  store,
  setConversationFn,
  setSaveStatus,
  setQueryConversation,
  invalidateConversations,
}: BuildWriteConversationOptions): (conversationId: string) => Promise<boolean> {
  return async (id: string): Promise<boolean> => {
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
    if (!store.get(conversationsAtom)[id]) return false;

    try {
      const row = await setConversationFn(data);
      const currentId = store.get(currentConversationIdAtom);
      if (currentId === row.id) {
        setSaveStatus({ conversationId: row.id, message: null, isDismissed: false });
      }
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
