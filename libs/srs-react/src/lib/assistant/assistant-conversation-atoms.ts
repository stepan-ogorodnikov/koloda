import type { AIChatMode } from "@koloda/ai-react";
import { atom } from "jotai";
import { atomWithReducer } from "jotai/utils";
import { conversationReducer, initialConversationState } from "./conversation-state";
import type { ConversationAction, ConversationState } from "./conversation-state";

export const assistantConversationStateAtom = atomWithReducer<ConversationState, ConversationAction>(
  initialConversationState,
  conversationReducer,
);

export const assistantMessagesAtom = atom((get) => get(assistantConversationStateAtom).messages);
export const assistantRunsAtom = atom((get) => get(assistantConversationStateAtom).runs);
export const assistantActiveRunIdAtom = atom((get) => get(assistantConversationStateAtom).activeRunId);
export const assistantModeAtom = atom((get) => get(assistantConversationStateAtom).mode);

export const assistantIsProcessingAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.activeRunId !== null;
});

export const assistantHasContextAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.messages.length > 0 || state.activeRunId !== null;
});

export const assistantContextUsageAtom = atom((get) => {
  const runs = get(assistantRunsAtom);
  let promptTokens = 0;
  let completionTokens = 0;
  let hasUsage = false;

  for (const run of Object.values(runs)) {
    if (run.usage) {
      hasUsage = true;
      promptTokens += run.usage.promptTokens;
      completionTokens += run.usage.completionTokens;
    }
  }

  if (!hasUsage) return null;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
});

export const assistantCancelFunctionsAtom = atom<{
  cancelGenerate?: () => void;
  cancelChat?: () => void;
}>({});

export const resetAssistantConversationAtom = atom(null, (get, set) => {
  set(assistantConversationStateAtom, {
    type: "newConversation",
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  });
  const cancels = get(assistantCancelFunctionsAtom);
  cancels.cancelGenerate?.();
  cancels.cancelChat?.();
});

export const setAssistantModeAtom = atom(null, (_get, set, mode: AIChatMode) => {
  set(assistantConversationStateAtom, { type: "setMode", mode });
});
