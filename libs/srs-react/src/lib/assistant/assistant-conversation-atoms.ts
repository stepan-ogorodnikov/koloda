import type { ModelParameter } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import { atom } from "jotai";
import { getAssistantMetadata } from "./assistant-messages";
import { conversationReducer, initialConversationState } from "./conversation-state";
import type { CardStatus, ConversationAction, ConversationState } from "./conversation-state";

export type SaveStatus = {
  conversationId: string | null;
  message: string | null;
  isDismissed: boolean;
};

const baseStateAtom = atom<ConversationState>(initialConversationState);

export const assistantConversationStateAtom = atom(
  (get) => get(baseStateAtom),
  (get, set, update: ConversationAction | ((prev: ConversationState) => ConversationState)) => {
    const next = typeof update === "function"
      ? (update as (prev: ConversationState) => ConversationState)(get(baseStateAtom))
      : conversationReducer(get(baseStateAtom), update);
    set(baseStateAtom, next);
  },
);

export const saveStatusAtom = atom<SaveStatus>({
  conversationId: null as string | null,
  message: null as string | null,
  isDismissed: false,
});

export const dismissSaveStatusAtom = atom(null, (_get, set) => {
  set(saveStatusAtom, (prev) => ({ ...prev, isDismissed: true }));
});

export const assistantActiveRunAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  if (state.activeRunId) return state.runs[state.activeRunId] ?? null;

  const ids = Object.keys(state.runs);
  const last = ids[ids.length - 1];

  return last ? state.runs[last] : null;
});

export const assistantErroredRunAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  const ids = Object.keys(state.runs);
  for (let i = ids.length - 1; i >= 0; i--) {
    const run = state.runs[ids[i]];
    if (run.status === "failed" && run.id !== state.dismissedRunErrorId) {
      return run;
    }
  }

  return null;
});

export const assistantMessagesAtom = atom((get) => get(assistantConversationStateAtom).messages);
export const assistantRunsAtom = atom((get) => get(assistantConversationStateAtom).runs);
export const assistantActiveRunIdAtom = atom((get) => get(assistantConversationStateAtom).activeRunId);
export const assistantModeAtom = atom((get) => get(assistantConversationStateAtom).mode);
export const assistantDeckIdAtom = atom((get) => get(assistantConversationStateAtom).deckId);
export const assistantAIProfileIdAtom = atom((get) => get(assistantConversationStateAtom).aiProfileId);
export const assistantAIModelIdAtom = atom((get) => get(assistantConversationStateAtom).modelId);
export const assistantAIModelParametersAtom = atom(
  (get) => get(assistantConversationStateAtom).modelParameters,
);

export const assistantIsProcessingAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.activeRunId !== null;
});

export const assistantHasContextAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.messages.length > 0 || state.activeRunId !== null;
});

export const assistantIsLockedAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.messages.some((m) => {
    if (m.role !== "assistant") return false;
    const metadata = getAssistantMetadata(m);
    if (metadata?.kind !== "generated-cards") return false;
    return state.runs[metadata.runId]?.status === "success";
  });
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

export const pendingSaveAtom = atom<number>(0);

export const restoreConversationAtom = atom(null, (_get, set, state: ConversationState) => {
  set(assistantConversationStateAtom, () => state);
});

export const setAssistantModeAtom = atom(null, (_get, set, mode: AIChatMode) => {
  set(assistantConversationStateAtom, { type: "setMode", mode });
  set(pendingSaveAtom, (n) => n + 1);
});

export const setAssistantDeckAtom = atom(null, (_get, set, deckId: number | null) => {
  set(assistantConversationStateAtom, { type: "setDeck", deckId });
  set(pendingSaveAtom, (n) => n + 1);
});

export const setAssistantAIProfileAtom = atom(
  null,
  (
    _get,
    set,
    payload: { profileId: string | null; modelId: string | null; modelParameters?: Partial<Record<ModelParameter["type"], string>> },
  ) => {
    set(assistantConversationStateAtom, { type: "setAIProfile", ...payload });
    set(pendingSaveAtom, (n) => n + 1);
  },
);

export const setAssistantAIModelAtom = atom(
  null,
  (
    _get,
    set,
    payload: { modelId: string | null; modelParameters?: Partial<Record<ModelParameter["type"], string>> },
  ) => {
    set(assistantConversationStateAtom, { type: "setAIModel", ...payload });
    set(pendingSaveAtom, (n) => n + 1);
  },
);

export const setAssistantAIModelParameterAtom = atom(
  null,
  (_get, set, payload: { paramType: ModelParameter["type"]; value: string | null }) => {
    set(assistantConversationStateAtom, { type: "setAIModelParameter", ...payload });
    set(pendingSaveAtom, (n) => n + 1);
  },
);

export const newConversationAtom = atom(null, (_get, set, id: string = generateUUID()) => {
  set(assistantConversationStateAtom, { type: "newConversation", id, createdAt: new Date() });
  return id;
});

export const setAssistantCardStatusAtom = atom(
  null,
  (_get, set, payload: { runId: string; index: number; status: CardStatus }) => {
    set(assistantConversationStateAtom, { type: "setCardStatus", ...payload });
    set(pendingSaveAtom, (n) => n + 1);
  },
);
