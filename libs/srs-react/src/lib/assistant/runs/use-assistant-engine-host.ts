import type { ChatStreamGenerator } from "@koloda/ai";
import { createAssistantEngine } from "@koloda/assistant";
import type { AssistantEngine, CardGenerationExecutor } from "@koloda/assistant";
import type { Store } from "jotai";
import { useStore } from "jotai";
import type { ConversationReducerAction } from "../state/conversation-reducer";
import {
  assistantConversationStateAtom,
  currentConversationIdAtom,
  dispatchToConversationOnStore,
  markReadIfCurrentOnStore,
  touchConversationOnStore,
} from "../state/conversation-store";

export type AssistantEngineTransports = {
  chatStreamGenerator: ChatStreamGenerator;
  streamGenerator: CardGenerationExecutor;
};

const transportRef: {
  chatStreamGenerator: ChatStreamGenerator | null;
  streamGenerator: CardGenerationExecutor | null;
} = {
  chatStreamGenerator: null,
  streamGenerator: null,
};

let engineInstance: AssistantEngine<ConversationReducerAction> | null = null;

function createEngineFromStore(store: Store): AssistantEngine<ConversationReducerAction> {
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
    readState: () => store.get(assistantConversationStateAtom),
  });
}

export function ensureAssistantEngine(store: Store): AssistantEngine<ConversationReducerAction> {
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

export function resetAssistantEngineForTests(): void {
  engineInstance?.dispose();
  engineInstance = null;
  transportRef.chatStreamGenerator = null;
  transportRef.streamGenerator = null;
}

/**
 * Route-scoped engine host. Owns run AbortControllers and per-conversation
 * runtimes so chat unmount does not abort background runs. Mount above
 * `AssistantChat` — same lifetime pattern as `useConversationSaveHost`.
 */
export function useAssistantEngineHost(): void {
  const store = useStore();
  ensureAssistantEngine(store);
}
