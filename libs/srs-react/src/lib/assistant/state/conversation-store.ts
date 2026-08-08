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

// INVARIANT: Exported for clone/store actions that switch current id without mark-as-read.
export const currentConversationIdAtom = atom<string | null>(null);

// INVARIANT: `newConversation` must NOT go through this helper — the reducer
// explicitly sets `updatedAt: null` for fresh conversations, and that
// must be preserved. The writable atom handles `newConversation` as a
// special case before reaching here.
const RUN_START_ACTIONS = new Set<ConversationReducerAction[0]>(["startRun", "restartRun", "submitTurn"]);

function applyConversationUpdate(
  prev: ConversationReducerState,
  update: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
): ConversationReducerState {
  const next =
    typeof update === "function"
      ? (update as (p: ConversationReducerState) => ConversationReducerState)(prev)
      : conversationReducer(prev, update);
  if (next === prev) return prev;

  // INVARIANT: Only stamp `updatedAt` on run start (startRun / restartRun / submitTurn). Function-form
  // updaters are used by derived atoms and side-effects that must not bump the timestamp.
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

export function dispatchToConversation(
  id: string,
  update: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
): (get: Getter, set: Setter) => void {
  return (get, set) => {
    const store = get(conversationsAtom);
    const prev = store[id];
    if (!prev) return;
    const next = applyConversationUpdate(prev, update);
    if (next === prev) return;
    set(conversationsAtom, { ...store, [id]: next });
  };
}

// WHY: Mark a run read only when it finishes in the conversation the user is viewing.
// Call after terminal run dispatches from stream hooks — background completions stay unread.
export function markReadIfCurrent(id: string, runId: string): (get: Getter, set: Setter) => void {
  return (get, set) => {
    if (get(currentConversationIdAtom) !== id) return;
    dispatchToConversation(id, ["markRead", { runId }])(get, set);
  };
}

export function dispatchToConversationOnStore(
  store: Store,
  id: string,
  action: ConversationReducerAction | ((prev: ConversationReducerState) => ConversationReducerState),
): void {
  dispatchToConversation(id, action)(store.get, store.set);
}

export function markReadIfCurrentOnStore(store: Store, id: string, runId: string): void {
  markReadIfCurrent(id, runId)(store.get, store.set);
}

export const saveStatusAtom = atom<SaveStatus>({
  conversationId: null as string | null,
  message: null as string | null,
  isDismissed: false,
});

export const dismissSaveStatusAtom = atom(null, (_get, set) => {
  set(saveStatusAtom, (prev) => ({ ...prev, isDismissed: true }));
});

// INVARIANT: Per-conversation pending-save counters — exported for remove/clone actions.
export const pendingSaveByConversationAtom = atom<Record<string, number>>({});

export const pendingSaveAtom = atom((get) => {
  const id = get(currentConversationIdAtom);
  if (!id) return 0;
  return get(pendingSaveByConversationAtom)[id] ?? 0;
});

// INVARIANT: Marks a specific conversation dirty by id — used for background
// run events so completion on A does not dirty currently-viewed B.
export const touchConversationAtom = atom(null, (_get, set, conversationId: string) => {
  set(pendingSaveByConversationAtom, (prev) => ({
    ...prev,
    [conversationId]: (prev[conversationId] ?? 0) + 1,
  }));
});

export function touchConversationOnStore(store: Store, conversationId: string): void {
  store.set(touchConversationAtom, conversationId);
}

// INVARIANT: Marks the *current* conversation dirty. Prefer
// `touchConversationAtom` when the originating id is known (stream events).
export const touchAtom = atom(null, (get, set) => {
  const id = get(currentConversationIdAtom);
  if (!id) return;
  set(touchConversationAtom, id);
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
        set(touchAtom);
      }
    }
  }
});

export const upsertConversationAtom = atom(null, (_get, set, state: ConversationReducerState) => {
  set(conversationsAtom, (prev) => ({ ...prev, [state.id]: state }));
});
