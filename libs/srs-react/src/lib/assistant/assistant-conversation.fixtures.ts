import type { createStore } from "jotai";
import { dispatchToConversationOnStore, markReadIfCurrentOnStore } from "./conversation-store";
import type { ConversationReducerAction, ConversationReducerState, GenerationRun } from "./conversation-reducer";
import { initialConversationState } from "./conversation-reducer";

export function makeRun(id: string, status: GenerationRun["status"]): GenerationRun {
  return {
    id,
    mode: "chat",
    status,
    cards: [],
    cardStatuses: {},
    templateFields: null,
    startedAt: new Date(1),
    elapsedSeconds: status === "streaming" ? null : 1,
  };
}

export function makeConversation(
  id: string,
  overrides: Partial<ConversationReducerState> = {},
): ConversationReducerState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    ...overrides,
  };
}

export function dispatchTo(
  store: ReturnType<typeof createStore>,
  id: string,
  action: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
) {
  dispatchToConversationOnStore(store, id, action);
}

/** Terminal run action + auto-mark-read when the conversation is current (mirrors stream hooks). */
export function dispatchTerminal(
  store: ReturnType<typeof createStore>,
  id: string,
  action: Extract<ConversationReducerAction, ["completeRun" | "cancelRun" | "runFailed", unknown]>,
) {
  dispatchToConversationOnStore(store, id, action);
  markReadIfCurrentOnStore(store, id, action[1].runId);
}
