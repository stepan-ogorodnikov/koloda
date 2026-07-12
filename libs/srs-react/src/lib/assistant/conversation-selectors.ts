import { atom } from "jotai";
import { getAssistantMetadata, getEffectiveChatMode } from "./assistant-messages";
import { findLatestErroredRun, getVisibleMessages } from "./conversation-reducer";
import { assistantConversationStateAtom, conversationsAtom } from "./conversation-store";

export const assistantErroredRunAtom = atom((get) => findLatestErroredRun(get(assistantConversationStateAtom)));

export const assistantMessagesAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return getVisibleMessages(state.messages, state.revertState);
});

export const assistantRevertStateAtom = atom((get) => get(assistantConversationStateAtom).revertState);
export const assistantRunsAtom = atom((get) => get(assistantConversationStateAtom).runs);
export const assistantActiveRunIdAtom = atom((get) => get(assistantConversationStateAtom).activeRunId);
export const assistantModeAtom = atom((get) => get(assistantConversationStateAtom).mode);
export const assistantDeckIdAtom = atom((get) => get(assistantConversationStateAtom).deckId);
export const assistantEffectiveModeAtom = atom((get) =>
  getEffectiveChatMode(get(assistantModeAtom), get(assistantDeckIdAtom)),
);
export const assistantProfileIdAtom = atom((get) => get(assistantConversationStateAtom).profileId);
export const assistantAIModelIdAtom = atom((get) => get(assistantConversationStateAtom).modelId);
export const assistantAIModelParametersAtom = atom((get) => get(assistantConversationStateAtom).modelParameters);

export const assistantIsProcessingAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.activeRunId !== null;
});

export const assistantHasContextAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return state.messages.length > 0 || state.activeRunId !== null;
});

export const assistantConversationHasContextAtom = (id: string) =>
  atom((get) => {
    const state = get(conversationsAtom)[id];
    return state ? state.messages.length > 0 || state.activeRunId !== null : false;
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

// WHY: Use one derived atom for the whole list instead of per-conversation
// derived atoms, which would create N subscriptions.
export const unreadConversationIdsAtom = atom((get) => {
  const store = get(conversationsAtom);
  const unread = new Set<string>();
  for (const [id, state] of Object.entries(store)) {
    const runIds = Object.keys(state.runs);
    if (runIds.length === 0) continue;
    const latestRunId = runIds[runIds.length - 1]!;
    const latestRun = state.runs[latestRunId];
    if (!latestRun) continue;
    if (latestRun.status === "streaming") continue;
    if (latestRun.id === state.lastReadRunId) continue;
    unread.add(id);
  }
  return unread;
});
