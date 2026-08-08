import type { ModelParameter } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai";
import { generateUUID } from "@koloda/app";
import { atom } from "jotai";
import { dropRuns } from "./conversation-reducer";
import type { CardStatus, ConversationReducerState } from "./conversation-reducer";
import { assistantIsLockedAtom } from "./conversation-selectors";
import {
  assistantConversationStateAtom,
  touchAtom,
  touchConversationAtom,
  conversationsAtom,
  currentConversationIdAtom,
  pendingSaveByConversationAtom,
} from "./conversation-store";

// WHY: After a successful DB delete we must drop the conversation from the
// in-memory store as well. Otherwise the route-scoped save host can still
// flush a queued snapshot and upsert the row back via `setConversation`'s
// `onConflictDoUpdate`. Clearing the pending-save entry disposes that id's
// queue; `write` also no-ops when the id is absent from the store.
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
  set(assistantConversationStateAtom, ["setMode", { mode }]);
  set(touchAtom);
});

export const setAssistantDeckAtom = atom(null, (get, set, deckId: number | null) => {
  if (get(assistantIsLockedAtom)) return;
  set(assistantConversationStateAtom, ["setDeck", { deckId }]);
  set(touchAtom);
});

type SetAssistantAIProfileAtomPayload = {
  profileId: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

export const setAssistantAIProfileAtom = atom(null, (_get, set, payload: SetAssistantAIProfileAtomPayload) => {
  set(assistantConversationStateAtom, ["setAIProfile", payload]);
  set(touchAtom);
});

export const setAssistantAIModelAtom = atom(
  null,
  (
    _get,
    set,
    payload: { modelId: string | null; modelParameters?: Partial<Record<ModelParameter["type"], string>> },
  ) => {
    set(assistantConversationStateAtom, ["setAIModel", payload]);
    set(touchAtom);
  },
);

export const setAssistantAIModelParameterAtom = atom(
  null,
  (_get, set, payload: { paramType: ModelParameter["type"]; value: string | null }) => {
    set(assistantConversationStateAtom, ["setAIModelParameter", payload]);
    set(touchAtom);
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
  set(assistantConversationStateAtom, ["newConversation", { ...payload, id, createdAt: new Date() }]);

  return id;
});

export const setAssistantCardStatusAtom = atom(
  null,
  (get, set, payload: { runId: string; index: number; status: CardStatus }) => {
    const id = get(currentConversationIdAtom);
    set(assistantConversationStateAtom, ["setCardStatus", payload]);
    // WHY: Card status edits are on the current conversation; touch by id so
    // the dirty write shares the same path as background run events.
    if (id) set(touchConversationAtom, id);
  },
);

export type CloneConversationPayload = {
  sourceId: string;
};

// WHY: Clone is implemented as a store-level action so all the derived
// atoms (sidebar list, unread indicators, active-run pulse, locked state)
// observe the new conversation in a single synchronous write — the
// sidebar shows the clone immediately and the route navigates to it
// without a re-render race. The reducer in `conversation-reducer.ts`
// would not help here: `submitTurn` / `addUserMessage` / `addAssistantMessage`
// append forward, and we need to copy an arbitrary prefix of the source's
// message history while dropping the message pair for any streaming run
// (linked by `runId` metadata). So the clone is assembled here directly
// and inserted into the store as a complete unit (see
// ASSISTANT-CHAT-CONVERSATIONS.md §Clone).
export const cloneConversationAtom = atom(null, (get, set, payload: CloneConversationPayload) => {
  const { sourceId } = payload;
  const store = get(conversationsAtom);
  const source = store[sourceId];
  if (!source) return null;

  const newId = generateUUID();
  const now = new Date();

  const droppedRunIds = new Set(
    Object.entries(source.runs)
      .filter(([, run]) => run.status === "streaming")
      .map(([runId]) => runId),
  );

  const { messages, runs } = dropRuns(source, droppedRunIds);

  // WHY: The clone starts out as read. `unreadConversationIdsAtom`
  // treats a conversation as read when `lastReadRunId` matches the
  // latest run id; setting it to the cloned run map's last key makes
  // the unread indicator stay hidden. If the clone ends up with no
  // runs (only-streaming source) the unread atom short-circuits on
  // empty runs, so `null` is fine there too.
  const clonedRunIds = Object.keys(runs);
  const latestClonedRunId = clonedRunIds.length > 0 ? clonedRunIds[clonedRunIds.length - 1]! : null;

  const cloned: ConversationReducerState = {
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
    revertState: null,
  };

  set(conversationsAtom, { ...store, [newId]: cloned });
  set(currentConversationIdAtom, newId);
  set(pendingSaveByConversationAtom, (prev) => ({ ...prev, [newId]: (prev[newId] ?? 0) + 1 }));
  return newId;
});
