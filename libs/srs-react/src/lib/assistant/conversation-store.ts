import { atom } from "jotai";
import type { Getter, Setter } from "jotai";
import type { Store } from "jotai/vanilla/store";
import { conversationReducer, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";

export type SaveStatus = {
  conversationId: string | null;
  message: string | null;
  isDismissed: boolean;
};

export type ConversationStore = Readonly<Record<string, ConversationReducerState>>;

export const conversationsAtom = atom<ConversationStore>({});

/** Current conversation id. Exported for store-level actions (clone) that must switch without mark-as-read. */
export const currentConversationIdAtom = atom<string | null>(null);

// INVARIANT: `newConversation` must NOT go through this helper — the reducer
// explicitly sets `updatedAt: null` for fresh conversations, and that
// must be preserved. The writable atom handles `newConversation` as a
// special case before reaching here.
const RUN_START_ACTIONS = new Set<ConversationReducerAction[0]>(["startRun", "restartRun"]);

function applyConversationUpdate(
  prev: ConversationReducerState,
  update: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
): ConversationReducerState {
  const next =
    typeof update === "function"
      ? (update as (p: ConversationReducerState) => ConversationReducerState)(prev)
      : conversationReducer(prev, update);
  if (next === prev) return prev;

  // Only stamp `updatedAt` when a new run starts (startRun / restartRun).
  // Function-form updaters are used by derived atoms and side-effects
  // that should never bump the conversation's last-modified timestamp.
  if (typeof update !== "function" && RUN_START_ACTIONS.has(update[0])) {
    return { ...next, updatedAt: new Date() };
  }

  return next;
}

export const assistantConversationStateAtom = atom(
  (get) => {
    const id = get(currentConversationIdAtom);
    if (!id) return initialConversationState;
    return get(conversationsAtom)[id] ?? initialConversationState;
  },
  (get, set, update: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState)) => {
    // WHY: newConversation carries its own target id. We must insert the
    // fresh entry and switch the current id even on cold start (when
    // currentConversationIdAtom is null). The reducer sets updatedAt: null
    // for fresh conversations, which is what we want — we do NOT stamp it.
    if (typeof update !== "function" && update[0] === "newConversation") {
      const store = get(conversationsAtom);
      const next = conversationReducer(store[update[1].id] ?? initialConversationState, update);
      if (next === (store[update[1].id] ?? initialConversationState)) return;
      set(conversationsAtom, { ...store, [update[1].id]: next });
      set(currentConversationIdAtom, update[1].id);
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
// this works for both the explicit `completeRun` / `runFailed` /
// `cancelRun` actions and for function-form updaters
// that mutate the run status directly.
function detectRunJustFinished(prev: ConversationReducerState, next: ConversationReducerState) {
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
  update: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
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
    const final =
      finishedRunId !== null && stamped.lastReadRunId !== finishedRunId
        ? { ...stamped, lastReadRunId: finishedRunId }
        : stamped;

    set(conversationsAtom, { ...store, [id]: final });
  };
}

export function dispatchToConversationOnStore(
  store: Store,
  id: string,
  action: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
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

/** Per-conversation pending-save counters. Exported for remove/clone actions. */
export const pendingSaveByConversationAtom = atom<Record<string, number>>({});

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
        dispatchToConversation(id, ["markRead", { runId: latestRunId }])(get, set);
        set(bumpPendingSaveAtom);
      }
    }
  }
});

export const upsertConversationAtom = atom(null, (_get, set, state: ConversationReducerState) => {
  set(conversationsAtom, (prev) => ({ ...prev, [state.id]: state }));
});
