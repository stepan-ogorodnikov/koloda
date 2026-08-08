import { computeConversationTitle } from "@koloda/ai";
import type { SetConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffect, useEffectEvent } from "react";
import { toPersistedState } from "./conversation-persistence";
import { createConversationSaveQueue } from "./create-conversation-save-queue";
import type { ConversationSaveQueue } from "./create-conversation-save-queue";
import {
  conversationsAtom,
  currentConversationIdAtom,
  dismissSaveStatusAtom,
  dispatchToConversation,
  pendingSaveByConversationAtom,
  saveStatusAtom,
} from "../state/conversation-store";

export type UseConversationSaveHostReturn = {
  handleDismissSave: () => void;
};

/**
 * App/route-scoped autosave host. Owns a per-conversation save queue map so
 * dirtying conversation A while viewing B still schedules and flushes a save
 * for A. Mount above `AssistantChat` — not inside the per-conversation chat
 * tree — so lifetime is independent of the viewed conversation id.
 */
export function useConversationSaveHost(): UseConversationSaveHostReturn {
  const queryClient = useQueryClient();
  const store = useStore();
  const { setConversationMutation } = useAtomValue(queriesAtom);
  const { mutationFn: setConversationFn } = setConversationMutation();
  const setSaveStatus = useSetAtom(saveStatusAtom);
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);

  // WHY: `setConversationFn` / queryClient are not referentially stable across
  // every render path we care about. Keep the write out of the host effect deps
  // via useEffectEvent (same pattern as the former per-chat saver).
  const writeConversation = useEffectEvent(async (id: string): Promise<boolean> => {
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
    if (!store.get(conversationsAtom)[id]) return false;

    try {
      const row = await setConversationFn(data);
      const currentId = store.get(currentConversationIdAtom);
      if (currentId === row.id) {
        setSaveStatus({ conversationId: row.id, message: null, isDismissed: false });
      }
      queryClient.setQueryData(queryKeys.conversations.detail(row.id), row);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      const savedAt = row.updatedAt ? new Date(row.updatedAt) : null;
      if (savedAt) {
        dispatchToConversation(row.id, (prev) => {
          const prevAt = prev.updatedAt instanceof Date ? prev.updatedAt : null;
          if (prevAt && prevAt.getTime() >= savedAt.getTime()) return prev;
          return { ...prev, updatedAt: savedAt };
        })(store.get, store.set);
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
  });

  useEffect(() => {
    const queues = new Map<string, ConversationSaveQueue>();
    let prevPending: Record<string, number> = { ...store.get(pendingSaveByConversationAtom) };

    const getQueue = (id: string): ConversationSaveQueue => {
      let queue = queues.get(id);
      if (!queue) {
        queue = createConversationSaveQueue({
          write: () => writeConversation(id),
          isStreaming: () => store.get(conversationsAtom)[id]?.activeRunId != null,
        });
        queues.set(id, queue);
      }
      return queue;
    };

    const syncFromPending = (next: Record<string, number>) => {
      for (const [id, count] of Object.entries(next)) {
        if (count > (prevPending[id] ?? 0)) {
          getQueue(id).notifyDirty();
        }
      }
      for (const id of Object.keys(prevPending)) {
        if (!(id in next)) {
          queues.get(id)?.dispose();
          queues.delete(id);
        }
      }
      prevPending = next;
    };

    // WHY: catch dirties that landed before this host subscribed (e.g. clone
    // while the route was mounting). One notify per already-pending id is
    // enough — the queue always persists the latest snapshot.
    for (const [id, count] of Object.entries(prevPending)) {
      if (count > 0) getQueue(id).notifyDirty();
    }

    const unsub = store.sub(pendingSaveByConversationAtom, () => {
      syncFromPending(store.get(pendingSaveByConversationAtom));
    });

    const handlePageHide = () => {
      for (const queue of queues.values()) {
        queue.flushNow();
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      unsub();
      for (const queue of queues.values()) {
        queue.dispose();
      }
      queues.clear();
    };
  }, [store]); // oxlint-disable-line react/exhaustive-deps -- writeConversation via useEffectEvent

  return {
    handleDismissSave: dismissSaveStatus,
  };
}
