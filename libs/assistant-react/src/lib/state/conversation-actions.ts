import type { ModelParameter } from "@koloda/ai";
import { generateUUID } from "@koloda/app";
import { atom } from "jotai";
import { dropRuns } from "./conversation-run-helpers";
import type { CardStatus, ConversationReducerState } from "./conversation-types";
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  assistantConversationStateAtom,
  dispatchToConversation,
  touchAtom,
  touchConversationAtom,
  conversationsAtom,
  currentConversationIdAtom,
  pendingSaveByConversationAtom,
  setCurrentConversationIdAtom,
  unassignedPromptInputAtom,
} from "./conversation-store";

// WHY: Called after coordinated delete (`beginDelete` → DB delete → commit →
// disposeConversation). Dropping the store entry and pending-save counter
// disposes the queue (#8); the host tombstone stays for the session so a late
// pending bump cannot resurrect the row. Do not clear before beginDelete awaits
// in-flight writes, or before disposeConversation reads run keys to abort.
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

type NewConversationPayload = {
  id: string;
  profileId?: string | null;
  modelId?: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

export const newConversationAtom = atom(null, (_get, set, payload: NewConversationPayload) => {
  set(assistantConversationStateAtom, ["newConversation", { ...payload, createdAt: new Date() }]);
});

// WHY: New conversation, delete-of-open, and session reset share this path.
// Clearing current id without inserting a replacement is what keeps the
// param-less route from minting. Restore must not do this on its own — a
// mint-on-prompt write can land before the URL catches up.
export const startParamlessConversationAtom = atom(null, (_get, set) => {
  set(setCurrentConversationIdAtom, null);
  set(unassignedPromptInputAtom, "");
});

export const setAssistantPromptInputAtom = atom(null, (get, set, text: string): string | null => {
  const id = get(currentConversationIdAtom);
  if (id) {
    const prev = get(assistantConversationStateAtom).promptInput;
    set(assistantConversationStateAtom, ["setPromptInput", text]);
    // WHY: Prompt edits persist the draft (composer + live title) but must
    // not stamp `updatedAt`. touchAtom dirties the save queue; run start owns the clock.
    if (prev !== text) set(touchAtom);
    return null;
  }

  if (text.trim() === "") {
    set(unassignedPromptInputAtom, text);
    return null;
  }

  const mintedId = generateUUID();
  const createdAt = new Date();
  const stored = get(aiProfileStateAtom);
  set(unassignedPromptInputAtom, "");
  set(assistantConversationStateAtom, [
    "newConversation",
    {
      id: mintedId,
      createdAt,
      profileId: stored?.profileId,
      modelId: stored?.modelId,
      modelParameters: stored?.modelParameters,
    },
  ]);
  set(assistantConversationStateAtom, ["setPromptInput", text]);
  set(touchAtom);
  return mintedId;
});

export const setAssistantCardStatusAtom = atom(
  null,
  (get, set, payload: { conversationId: string; runId: string; index: number; status: CardStatus }) => {
    const { conversationId, runId, index, status } = payload;
    // INVARIANT: Add can finish after the user has switched conversations.
    // Status writes target the originating conversation, not the one now
    // on screen (ASSISTANT-CONVERSATIONS.md Concurrent Behavior).
    if (!(conversationId in get(conversationsAtom))) return;
    dispatchToConversation(conversationId, ["setCardStatus", { runId, index, status }])(get, set);
    set(touchConversationAtom, conversationId);
  },
);

export type CloneConversationPayload = {
  sourceId: string;
};

// WHY: Clone is a store-level action, not a reducer case: `submitTurn` /
// `addUserMessage` / `addAssistantMessage` append forward, and the clone
// copies an arbitrary prefix of the source's message history while dropping
// the message pair for any streaming run (linked by `runId` metadata). So the
// clone is assembled here and inserted into the store as a complete unit,
// which the route then navigates to. The sidebar is the DB list query: it
// shows the clone once the clone's first save invalidates that list (see
// ASSISTANT-CONVERSATION-LIST.md (§Clone)).
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
    // WHY: `null` makes the first save stamp the time, which puts the clone
    // at the top of the list; the save's ack writes that time into the store.
    updatedAt: null,
    messages,
    runs,
    activeRunId: null,
    dismissedRunErrorId: null,
    lastReadRunId: latestClonedRunId,
    // WHY: Clone copies the thread, not the unsent composer. Spec lists
    // messages, completed runs, AI profile, and name — not prompt input.
    promptInput: "",
    revertState: null,
  };

  set(conversationsAtom, { ...store, [newId]: cloned });
  set(currentConversationIdAtom, newId);
  set(pendingSaveByConversationAtom, (prev) => ({ ...prev, [newId]: (prev[newId] ?? 0) + 1 }));
  return newId;
});
