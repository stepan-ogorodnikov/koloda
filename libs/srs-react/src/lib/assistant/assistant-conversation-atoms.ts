import type { ModelParameter } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import { atom } from "jotai";
import type { Getter, Setter } from "jotai";
import type { Store } from "jotai/vanilla/store";
import { getAssistantMetadata } from "./assistant-messages";
import { conversationReducer, getVisibleMessages, initialConversationState } from "./conversation-state";
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
  if (typeof update !== "function" && (update.type === "markRead" || update.type === "setRevertState")) {
    return next;
  }

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
    dispatchToConversation(id, update)(get, set);
  },
);

// WHY: A run that finishes while the user is viewing the conversation
// has been implicitly "read" — the user watched it stream. Bumping
// `lastReadRunId` to the just-finished run id keeps the conversation
// out of `unreadConversationIdsAtom` after the user navigates away.
// We detect the transition by comparing the latest run id in `prev`
// and `next` and checking that its status moved out of `streaming`;
// this works for both the explicit `completeRun` / `failRun` /
// `runFailed` / `cancelRun` actions and for function-form updaters
// that mutate the run status directly.
function detectRunJustFinished(prev: ConversationState, next: ConversationState) {
  const prevIds = Object.keys(prev.runs);
  const nextIds = Object.keys(next.runs);
  if (prevIds.length === 0 || nextIds.length === 0) return null;
  const prevLatest = prevIds[prevIds.length - 1]!;
  const nextLatest = nextIds[nextIds.length - 1]!;
  if (prevLatest !== nextLatest) return null;
  const prevRun = prev.runs[prevLatest];
  const nextRun = next.runs[nextLatest];
  if (!prevRun || !nextRun) return null;
  if (prevRun.status !== "streaming") return null;
  if (nextRun.status === "streaming") return null;

  return nextLatest;
}

export function dispatchToConversation(
  id: string,
  update: ConversationAction | ((prev: ConversationState) => ConversationState),
): (get: Getter, set: Setter) => void {
  return (get, set) => {
    const store = get(conversationsAtom);
    const prev = store[id];
    if (!prev) return;
    const stamped = applyConversationUpdate(prev, update);
    if (stamped === prev) return;

    // WHY: See `detectRunJustFinished`. We only mark-as-read when the
    // dispatch targets the currently-viewed conversation; a background
    // run finishing in a non-current conversation must remain unread
    // so the user notices it when they return.
    const currentId = get(currentConversationIdAtom);
    const finishedRunId = id === currentId ? detectRunJustFinished(prev, stamped) : null;
    const final = finishedRunId !== null && stamped.lastReadRunId !== finishedRunId
      ? { ...stamped, lastReadRunId: finishedRunId }
      : stamped;

    set(conversationsAtom, { ...store, [id]: final });
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

export const assistantMessagesAtom = atom((get) => {
  const state = get(assistantConversationStateAtom);
  return getVisibleMessages(state.messages, state.revertState);
});

export const assistantRevertStateAtom = atom((get) => get(assistantConversationStateAtom).revertState);
export const assistantRunsAtom = atom((get) => get(assistantConversationStateAtom).runs);
export const assistantActiveRunIdAtom = atom((get) => get(assistantConversationStateAtom).activeRunId);
export const assistantModeAtom = atom((get) => get(assistantConversationStateAtom).mode);
export const assistantDeckIdAtom = atom((get) => get(assistantConversationStateAtom).deckId);
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

export const setCurrentConversationIdAtom = atom(null, (get, set, id: string | null) => {
  set(currentConversationIdAtom, id);
  // WHY: Opening a conversation is what marks it as read (see
  // ASSISTANT-CHAT-CONVERSATIONS.md §Unread Status). Dispatch a markRead
  // for the latest run, so the conversation clears its unread state and
  // the updated `lastReadRunId` is persisted. We do this here rather than
  // at the route layer so any future caller of this atom (deep links,
  // keyboard shortcuts, etc.) gets the same behavior.
  if (id) {
    const state = get(conversationsAtom)[id];
    if (state) {
      const runIds = Object.keys(state.runs);
      const latestRunId = runIds[runIds.length - 1] ?? null;
      if (latestRunId && latestRunId !== state.lastReadRunId) {
        dispatchToConversation(id, { type: "markRead", runId: latestRunId })(get, set);
        set(bumpPendingSaveAtom);
      }
    }
  }
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

export const upsertConversationAtom = atom(null, (_get, set, state: ConversationState) => {
  set(conversationsAtom, (prev) => ({ ...prev, [state.id]: state }));
});

// WHY: After a successful DB delete we must drop the conversation from the
// in-memory store as well. Otherwise the pending-save effect in
// `useConversationPersistence` keeps a reference to the deleted state and
// its cleanup-time `flush` will upsert the row back into the database via
// `setConversation`'s `onConflictDoUpdate` — making the conversation
// reappear in the list as soon as the list query is invalidated. This only
// affected the *active* conversation because that is the only one for
// which `useConversationPersistence` is mounted, which matches the user
// report of "only the first conversation reappears".
export const removeConversationAtom = atom(null, (_get, set, id: string) => {
  set(conversationsAtom, (prev) => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
  set(pendingSaveByConversationAtom, (prev) => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
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

export type CloneConversationPayload = {
  sourceId: string;
};

// WHY: Clone is implemented as a store-level action so all the derived
// atoms (sidebar list, unread indicators, active-run pulse, locked state)
// observe the new conversation in a single synchronous write — the
// sidebar shows the clone immediately and the route navigates to it
// without a re-render race. The reducer in `conversation-state.ts`
// would not help here: messages are only ever appended one at a time
// via `addUserMessage` / `addAssistantMessage`, and we need to copy an
// arbitrary prefix of the source's message history while dropping the
// `user-<runId>` / `assistant-<runId>` pair for any streaming run. So
// the clone is assembled here directly and inserted into the store as a
// complete unit (see ASSISTANT-CHAT-CONVERSATIONS.md §Clone).
export const cloneConversationAtom = atom(null, (get, set, payload: CloneConversationPayload) => {
  const { sourceId } = payload;
  const store = get(conversationsAtom);
  const source = store[sourceId];
  if (!source) return null;

  const newId = generateUUID();
  const now = new Date();

  // WHY: Identify streaming runs upfront so we can drop their runs
  // and the user/assistant message pair that belongs to them. §Clone
  // explicitly excludes in-flight runs from the copy.
  const droppedRunIds = new Set(
    Object.entries(source.runs)
      .filter(([, run]) => run.status === "streaming")
      .map(([runId]) => runId),
  );

  const messages = source.messages.filter((m) => {
    if (m.role === "user") {
      const runId = m.id.startsWith("user-") ? m.id.slice(5) : null;
      return !runId || !droppedRunIds.has(runId);
    }
    if (m.role === "assistant") {
      const runId = m.id.startsWith("assistant-") ? m.id.slice(10) : null;
      return !runId || !droppedRunIds.has(runId);
    }
    return true;
  });

  const runs: ConversationState["runs"] = {};
  for (const [runId, run] of Object.entries(source.runs)) {
    if (run.status === "streaming") continue;
    runs[runId] = run;
  }

  // WHY: The clone starts out as read. `unreadConversationIdsAtom`
  // treats a conversation as read when `lastReadRunId` matches the
  // latest run id; setting it to the cloned run map's last key makes
  // the unread indicator stay hidden. If the clone ends up with no
  // runs (only-streaming source) the unread atom short-circuits on
  // empty runs, so `null` is fine there too.
  const clonedRunIds = Object.keys(runs);
  const latestClonedRunId = clonedRunIds.length > 0 ? clonedRunIds[clonedRunIds.length - 1]! : null;

  const cloned: ConversationState = {
    ...source,
    id: newId,
    createdAt: now,
    // WHY: `null` (not `now`) so the clone sorts by `createdAt` rather
    // than pinning itself to the top of the list. The next
    // content-changing dispatch will stamp a real `updatedAt` via
    // `applyConversationUpdate`. Mirrors the `newConversation` path.
    updatedAt: null,
    messages,
    runs,
    activeRunId: null,
    deckId: source.deckId,
    dismissedRunErrorId: null,
    lastReadRunId: latestClonedRunId,
  };

  set(conversationsAtom, { ...store, [newId]: cloned });
  set(currentConversationIdAtom, newId);
  set(pendingSaveByConversationAtom, (prev) => ({ ...prev, [newId]: (prev[newId] ?? 0) + 1 }));
  return newId;
});
