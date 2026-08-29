import type { AssistantEngine } from "@koloda/assistant";
import { createAssistantEngine } from "@koloda/assistant";
import type { createStore } from "jotai";
import {
  conversationsAtom,
  dispatchToConversationOnStore,
  markReadIfCurrentOnStore,
  touchConversationOnStore,
} from "../state/conversation-store";
import { createAssistantExecutionPort } from "./assistant-execution-port";
import { assistantEventToReducerAction } from "./assistant-event-to-action";

export type AssistantJotaiStore = ReturnType<typeof createStore>;

let engineInstance: AssistantEngine | null = null;
let boundStore: AssistantJotaiStore | null = null;

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

export function ensureAssistantEngine(store: AssistantJotaiStore): AssistantEngine {
  if (engineInstance) {
    // INVARIANT: The engine binds the first store it sees — silently binding a
    // different store would read/write a stale conversation snapshot. Fail
    // fast on re-init with a different store instead.
    if (boundStore !== store) {
      throw new Error("AssistantEngine is already bound to a different Jotai store");
    }
    return engineInstance;
  }
  boundStore = store;
  engineInstance = createEngineFromStore(store);
  return engineInstance;
}

export function getAssistantEngine(): AssistantEngine {
  if (!engineInstance)
    throw new Error("AssistantEngine not initialized — mount useAssistantEngineHost at application-shell scope");
  return engineInstance;
}

/** Tests only: dispose the engine and release its store binding. */
export function resetEngineInstanceForTests(): void {
  engineInstance?.dispose();
  engineInstance = null;
  boundStore = null;
}
