import { atom } from "jotai";
import { findLatestErroredRun, getVisibleMessages } from "./conversation-reducer";
import { getMessageRunId } from "./assistant-messages";
import { assistantConversationStateAtom, conversationsAtom } from "./conversation-store";

export const assistantErroredRunAtom = atom((get) => findLatestErroredRun(get(assistantConversationStateAtom)));

export const assistantMessagesAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return getVisibleMessages(state.messages, state.revertState);
});

export const assistantRevertStateAtom = atom((get) => get(assistantConversationStateAtom).revertState);
export const assistantRunsAtom = atom((get) => get(assistantConversationStateAtom).runs);
export const assistantActiveRunIdAtom = atom((get) => get(assistantConversationStateAtom).activeRunId);
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

// WHY: The next request's context is the LATEST run's usage — every run's
// prompt already includes the full history, so summing across runs
// double-counts and grows quadratically against the context window. Walk the
// visible message list backwards so "latest" is structural, not key order.
export const assistantContextUsageAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  const visibleMessages = getVisibleMessages(state.messages, state.revertState);
  for (let i = visibleMessages.length - 1; i >= 0; i--) {
    const runId = getMessageRunId(visibleMessages[i]!);
    const run = runId ? state.runs[runId] : undefined;
    if (run?.usage) return run.usage;
  }
  return null;
});

let lastUnreadSet: Set<string> | null = null;

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
  // WHY: `conversationsAtom` is rewritten on every streamed chunk; returning
  // a fresh Set each time would re-render the sidebar at chunk rate even
  // when unread membership is unchanged. Keep the previous reference while
  // membership is identical (membership is always compared against the
  // freshly computed set, so cross-store staleness is impossible).
  const previous = lastUnreadSet;
  if (previous !== null && previous.size === unread.size && [...unread].every((id) => previous.has(id))) {
    return previous;
  }
  lastUnreadSet = unread;
  return unread;
});
