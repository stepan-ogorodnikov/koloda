import { queriesAtom } from "@koloda/core-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useEffect, useRef } from "react";
import { aiProfileStateAtom } from "../state/ai-profile-state";
import type { AIProfileState } from "../state/ai-profile-state";
import { normalizeRestoredConversation } from "./conversation-persistence";
import { coerceConversationState } from "./conversation-persistence-schema";
import { initialConversationState } from "../state/conversation-reducer";
import type { ConversationReducerState } from "../state/conversation-reducer";
import {
  touchAtom,
  conversationsAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
  blockedConversationRestoreAtom,
  clearBlockedConversationRestore,
} from "../state/conversation-store";
import type { BlockedConversationRestore } from "../state/conversation-store";

function freshConversation(id: string, stored: AIProfileState | null): ConversationReducerState {
  return { ...initialConversationState, id, createdAt: new Date(), ...stored };
}

export type UseConversationRestoreOptions = {
  conversationId: string | undefined;
};

export type UseConversationRestoreReturn = {
  isRestoring: boolean;
  loadError: Error | null;
  retryLoad: () => Promise<unknown>;
  blockedRestore: BlockedConversationRestore | null;
};

export function useConversationRestore({
  conversationId,
}: UseConversationRestoreOptions): UseConversationRestoreReturn {
  const store = useStore();
  const restoredIdRef = useRef<string | null>(null);
  const { getConversationQuery } = useAtomValue(queriesAtom);
  const blockedStore = useAtomValue(blockedConversationRestoreAtom);
  const setBlockedConversationRestore = useSetAtom(blockedConversationRestoreAtom);
  const {
    data: conversationData,
    error: conversationError,
    refetch,
    isLoading,
    isFetching,
  } = useQuery({
    ...getConversationQuery(conversationId!),
    enabled: !!conversationId,
  });
  const touch = useSetAtom(touchAtom);
  const setCurrentConversationId = useSetAtom(setCurrentConversationIdAtom);
  const upsertConversation = useSetAtom(upsertConversationAtom);
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));

  useEffect(() => {
    if (!conversationId) return;
    if (restoredIdRef.current === conversationId) return;
    if (isLoading) return;
    if (isFetching && !conversationData) return;
    // WHY: Don't overwrite with a fresh empty state when the query failed.
    if (conversationError) return;

    // WHY: If the store already has state for this id (cold start or background
    // run), keep it — overwriting from DB would kill in-flight streams. Live
    // state and blocked recovery are mutually exclusive, so also clear any
    // stale blocked entry for the id.
    if (store.get(conversationsAtom)[conversationId]) {
      setBlockedConversationRestore((prev) => clearBlockedConversationRestore(prev, conversationId));
      restoredIdRef.current = conversationId;
      setCurrentConversationId(conversationId);
      touch();
      return;
    }

    const result = coerceConversationState(conversationData?.state);
    if (result.status === "ok") {
      // WHY: fall back to the coerced state when normalize makes no changes so a row
      // that is already clean round-trips verbatim.
      upsertConversation(normalizeRestoredConversation(result.state) ?? result.state);
      setBlockedConversationRestore((prev) => clearBlockedConversationRestore(prev, conversationId));
    } else if (result.status === "missing") {
      upsertConversation(freshConversation(conversationId, readLastUsed()));
      setBlockedConversationRestore((prev) => clearBlockedConversationRestore(prev, conversationId));
    } else {
      // WHY: unsupportedVersion / corrupt rows must never become editable
      // current-version state and must never be written back by autosave,
      // touch, or any other write path. The stored row is left untouched; the
      // recovery screen renders from this entry and an explicit reset/delete
      // is the only way to clear it. No touch() below — dirtying the id would
      // schedule a write (which the empty-store guard would no-op, but the
      // blocked row must not even be scheduled).
      setBlockedConversationRestore((prev) => ({ ...prev, [conversationId]: result }));
    }
    restoredIdRef.current = conversationId;
    // WHY: Setting the current id AFTER the conversation is in the store
    // lets `setCurrentConversationIdAtom`'s mark-read side effect find
    // the latest run id and dispatch a `markRead`. The pending-save bump
    // below persists the refreshed `lastReadRunId` on first restore, so
    // a freshly opened conversation is not shown as unread on next load.
    // Autosave is owned by `useConversationSaveHost` (application-shell), so
    // this touch no longer depends on saver-before-restore effect registration.
    setCurrentConversationId(conversationId);
    // WHY: Only editable restores (ok / missing) may dirty the conversation.
    // Blocked rows must never reach the save queue.
    if (result.status === "ok" || result.status === "missing") touch();
  }, [
    store,
    conversationId,
    conversationData,
    isLoading,
    isFetching,
    conversationError,
    setCurrentConversationId,
    upsertConversation,
    touch,
    readLastUsed,
    setBlockedConversationRestore,
  ]);

  // WHY: A conversation just created via `newConversationAtom` or
  // `cloneConversationAtom` is already in the store but its queryKey
  // has never been fetched, so `isLoading: true` on the first render
  // would briefly swap the chat branch for the restoring branch and
  // remount the prompt panel. Skip restoring when the id is already
  // in the store — the restore effect above uses the same condition
  // to decide whether to load from DB.
  return {
    isRestoring:
      !!conversationId &&
      isLoading &&
      restoredIdRef.current !== conversationId &&
      !store.get(conversationsAtom)[conversationId],
    loadError: conversationError ?? null,
    retryLoad: refetch,
    blockedRestore: conversationId ? (blockedStore[conversationId] ?? null) : null,
  };
}
