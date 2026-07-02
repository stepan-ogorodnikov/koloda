import type { ModelParameter } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import { atom } from "jotai";
import type { Getter, Setter } from "jotai";
import type { Store } from "jotai/vanilla/store";
import { getAssistantMetadata } from "./assistant-messages";
import { conversationReducer, initialConversationState } from "./conversation-state";
import type { CardStatus, ConversationAction, ConversationState } from "./conversation-state";

export type SaveStatus = {
  conversationId: string | null;
  message: string | null;
  isDismissed: boolean;
};

export type ConversationStore = Readonly<Record<string, ConversationState>>;

export const conversationsAtom = atom<ConversationStore>({});
const currentConversationIdAtom = atom<string | null>(null);

// INVARIANT: `newConversation` must NOT go through this helper — the reducer
// explicitly sets `updatedAt: null` for fresh conversations, and that
// must be preserved. The writable atom handles `newConversation` as a
// special case before reaching here.
function applyConversationUpdate(
  prev: ConversationState,
  update: ConversationAction | ((prev: ConversationState) => ConversationState),
): ConversationState {
  const next = typeof update === "function"
    ? (update as (p: ConversationState) => ConversationState)(prev)
    : conversationReducer(prev, update);
  if (next === prev) return prev;
  return { ...next, updatedAt: new Date() };
}

export const assistantConversationStateAtom = atom(
  (get) => {
    const id = get(currentConversationIdAtom);
    if (!id) return initialConversationState;
    return get(conversationsAtom)[id] ?? initialConversationState;
  },
  (get, set, update: ConversationAction | ((prev: ConversationState) => ConversationState)) => {
    // WHY: newConversation carries its own target id. We must insert the
    // fresh entry and switch the current id even on cold start (when
    // currentConversationIdAtom is null). The reducer sets updatedAt: null
    // for fresh conversations, which is what we want — we do NOT stamp it.
    if (typeof update !== "function" && update.type === "newConversation") {
      const store = get(conversationsAtom);
      const next = conversationReducer(store[update.id] ?? initialConversationState, update);
      if (next === (store[update.id] ?? initialConversationState)) return;
      set(conversationsAtom, { ...store, [update.id]: next });
      set(currentConversationIdAtom, update.id);
      return;
    }

    const id = get(currentConversationIdAtom);
    if (!id) return;
    const store = get(conversationsAtom);
    const prev = store[id] ?? initialConversationState;
    const stamped = applyConversationUpdate(prev, update);
    if (stamped === prev) return;
    set(conversationsAtom, { ...store, [id]: stamped });
  },
);

export function dispatchToConversation(
  id: string,
  update: ConversationAction | ((prev: ConversationState) => ConversationState),
): (get: Getter, set: Setter) => void {
  return (get, set) => {
    const store = get(conversationsAtom);
    const prev = store[id];
    if (!prev) return; // unknown conversation — drop
    const stamped = applyConversationUpdate(prev, update);
    if (stamped === prev) return;
    set(conversationsAtom, { ...store, [id]: stamped });
  };
}

export function dispatchToConversationOnStore(
  store: Store,
  id: string,
  action: ConversationAction | ((prev: ConversationState) => ConversationState),
): void {
  dispatchToConversation(id, action)(store.get, store.set);
}

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
export const assistantProfileIdAtom = atom((get) => get(assistantConversationStateAtom).profileId);
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

const pendingSaveByConversationAtom = atom<Record<string, number>>({});

export const pendingSaveAtom = atom((get) => {
  const id = get(currentConversationIdAtom);
  if (!id) return 0;
  return get(pendingSaveByConversationAtom)[id] ?? 0;
});

export const bumpPendingSaveAtom = atom(null, (get, set) => {
  const id = get(currentConversationIdAtom);
  if (!id) return;
  set(pendingSaveByConversationAtom, (prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
});

export const setCurrentConversationIdAtom = atom(null, (_get, set, id: string | null) => {
  set(currentConversationIdAtom, id);
});

export const upsertConversationAtom = atom(null, (_get, set, state: ConversationState) => {
  set(conversationsAtom, (prev) => ({ ...prev, [state.id]: state }));
});

export const setAssistantModeAtom = atom(null, (_get, set, mode: AIChatMode) => {
  set(assistantConversationStateAtom, { type: "setMode", mode });
  set(bumpPendingSaveAtom);
});

export const setAssistantDeckAtom = atom(null, (get, set, deckId: number | null) => {
  if (get(assistantIsLockedAtom)) return;
  set(assistantConversationStateAtom, { type: "setDeck", deckId });
  set(bumpPendingSaveAtom);
});

type SetAssistantAIProfileAtomPayload = {
  profileId: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

export const setAssistantAIProfileAtom = atom(null, (_get, set, payload: SetAssistantAIProfileAtomPayload) => {
  set(assistantConversationStateAtom, { type: "setAIProfile", ...payload });
  set(bumpPendingSaveAtom);
});

export const setAssistantAIModelAtom = atom(
  null,
  (
    _get,
    set,
    payload: { modelId: string | null; modelParameters?: Partial<Record<ModelParameter["type"], string>> },
  ) => {
    set(assistantConversationStateAtom, { type: "setAIModel", ...payload });
    set(bumpPendingSaveAtom);
  },
);

export const setAssistantAIModelParameterAtom = atom(
  null,
  (_get, set, payload: { paramType: ModelParameter["type"]; value: string | null }) => {
    set(assistantConversationStateAtom, { type: "setAIModelParameter", ...payload });
    set(bumpPendingSaveAtom);
  },
);

export type NewConversationPayload = {
  id?: string;
  profileId?: string | null;
  modelId?: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

export const newConversationAtom = atom(null, (_get, set, payload: NewConversationPayload = {}) => {
  const id = payload.id ?? generateUUID();
  set(assistantConversationStateAtom, {
    ...payload,
    type: "newConversation",
    id,
    createdAt: new Date(),
  });

  return id;
});

export const setAssistantCardStatusAtom = atom(
  null,
  (_get, set, payload: { runId: string; index: number; status: CardStatus }) => {
    set(assistantConversationStateAtom, { type: "setCardStatus", ...payload });
    set(bumpPendingSaveAtom);
  },
);
