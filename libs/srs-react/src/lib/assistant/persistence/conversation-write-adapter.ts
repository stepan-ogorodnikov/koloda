import { computeConversationTitle } from "@koloda/ai";
import type { Conversation, SetConversationData } from "@koloda/app";
import { ensureAssistantEngine } from "../runs/assistant-engine-instance";
import { ensureAssistantPersistenceHost } from "../runs/assistant-persistence-host";
import type { AssistantJotaiStore } from "../runs/assistant-engine-instance";
import { toPersistedState } from "./conversation-persistence";
import { removeConversationAtom } from "../state/conversation-actions";
import type { SaveStatus } from "../state/conversation-store";
import {
  blockedConversationRestoreAtom,
  clearBlockedConversationRestore,
  conversationsAtom,
  currentConversationIdAtom,
  dispatchToConversationOnStore,
} from "../state/conversation-store";

export type BuildWriteConversationOptions = {
  store: AssistantJotaiStore;
  setConversationFn: (data: SetConversationData) => Promise<Conversation>;
  setSaveStatus: (status: SaveStatus) => void;
  setQueryConversation: (id: string, row: Conversation) => void;
  invalidateConversations: () => void;
  /** When true, skip the upsert — conversation is mid coordinated delete (#8). */
  isTombstoned: (conversationId: string) => boolean;
};

/** Shared durable-write adapter for the engine persistence host. */
export function buildWriteConversation({
  store,
  setConversationFn,
  setSaveStatus,
  setQueryConversation,
  invalidateConversations,
  isTombstoned,
}: BuildWriteConversationOptions): (conversationId: string) => Promise<boolean> {
  return async (id: string): Promise<boolean> => {
    if (isTombstoned(id)) return false;
    const state = store.get(conversationsAtom)[id];
    if (!state) return false;
    if (state.messages.length === 0 && state.activeRunId === null) return false;

    // WHY: persist the live snapshot as-is — including in-flight `streaming`
    // checkpoints. Restore converts orphaned streaming runs to
    // `interrupted`/`crash_recovery`. Do not rewrite streaming → canceled here;
    // only an explicit user cancel produces `canceled`/`user`.
    const persistState = toPersistedState(state);
    const title = computeConversationTitle(persistState);
    const data: SetConversationData = {
      id: persistState.id,
      // WHY: structuredClone detaches persistState from the Jotai store so the
      // async write below doesn't capture a reference the reducer will keep
      // mutating. Unlike JSON.parse(JSON.stringify(...)) it preserves Date
      // instances; serialization to the jsonb column happens at the DB layer.
      state: structuredClone(persistState),
      title,
      updatedAt: persistState.updatedAt,
    };

    // WHY: re-check after cloning — a delete can land between snapshot and write.
    if (isTombstoned(id) || !store.get(conversationsAtom)[id]) return false;

    try {
      const row = await setConversationFn(data);
      // WHY: coordinated delete may have finished while the upsert ran; do not
      // push a resurrected row into the query cache or store timestamps.
      if (isTombstoned(id) || !store.get(conversationsAtom)[id]) return false;
      const currentId = store.get(currentConversationIdAtom);
      if (currentId === row.id)
        setSaveStatus({
          conversationId: row.id,
          message: null,
          isDismissed: false,
        });
      setQueryConversation(row.id, row);
      invalidateConversations();
      const savedAt = row.updatedAt ? new Date(row.updatedAt) : null;
      if (savedAt) {
        dispatchToConversationOnStore(store, row.id, (prev) => {
          const prevAt = prev.updatedAt instanceof Date ? prev.updatedAt : null;
          if (prevAt && prevAt.getTime() >= savedAt.getTime()) return prev;
          return { ...prev, updatedAt: savedAt };
        });
      }
      return true;
    } catch (error) {
      console.error("Failed to save conversation", error);
      const currentId = store.get(currentConversationIdAtom);
      if (currentId === id) {
        setSaveStatus({
          conversationId: id,
          message: (error as Error).message,
          isDismissed: false,
        });
      }
      throw error;
    }
  };
}

export type DeleteAssistantConversationOptions = {
  store: AssistantJotaiStore;
  conversationId: string;
  deleteFromDb: (id: string) => Promise<unknown>;
  invalidateConversations: () => void;
  removeConversationQuery: (id: string) => void;
};

/**
 * Coordinated conversation delete (#8): provisional tombstone → cancel queued →
 * await in-flight write → DB delete → commit tombstone → dispose runtime
 * (while store still has runs) → drop store/query cache.
 *
 * On DB failure, rollback restores autosave so the conversation stays editable
 * and a later delete can succeed (#6).
 */
export async function deleteAssistantConversation({
  store,
  conversationId,
  deleteFromDb,
  invalidateConversations,
  removeConversationQuery,
}: DeleteAssistantConversationOptions): Promise<void> {
  const host = ensureAssistantPersistenceHost(store);
  const engine = ensureAssistantEngine(store);

  const deletion = await host.beginDelete(conversationId);
  try {
    await deleteFromDb(conversationId);
    deletion.commit();
  } catch (error) {
    // WHY: failed DB delete must not leave a permanent host tombstone — the
    // conversation stays in the store/UI and subsequent edits must autosave (#6).
    deletion.rollback();
    throw error;
  }
  // WHY: dispose while store still has run keys — cancel loop reads
  // readConversationState; clearing first leaves empty runs and never aborts (#8).
  // INVARIANT: only after successful commit — failure must not dispose/remove.
  engine.disposeConversation(conversationId);
  store.set(removeConversationAtom, conversationId);
  // WHY: A blocked row (unsupportedVersion/corrupt) is never in the store, so
  // removeConversationAtom cannot clean it up — clear the recovery entry here
  // so a deleted id cannot linger as blocked.
  store.set(blockedConversationRestoreAtom, (prev) => clearBlockedConversationRestore(prev, conversationId));
  invalidateConversations();
  removeConversationQuery(conversationId);
}
