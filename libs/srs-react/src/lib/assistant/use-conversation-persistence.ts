import { computeConversationTitle } from "@koloda/ai";
import type { Conversation, SetConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useEffect, useRef } from "react";
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  assistantConversationStateAtom,
  bumpPendingSaveAtom,
  conversationsAtom,
  dismissSaveStatusAtom,
  pendingSaveAtom,
  saveStatusAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./assistant-conversation-atoms";
import {
  cancelStreamingRuns,
  coerceConversationState,
  initialConversationState,
  normalizeRestoredConversation,
} from "./conversation-state";
import type { ConversationState } from "./conversation-state";

const STREAM_SAVE_THROTTLE_MS = 1000;
const IDLE_SAVE_DEBOUNCE_MS = 250;

export type UseConversationPersistenceOptions = {
  conversationId: string | undefined;
};

export type UseConversationPersistenceReturn = {
  handleDismissSave: () => void;
  isRestoring: boolean;
  loadError: Error | null;
  retryLoad: () => Promise<unknown>;
};

export function useConversationPersistence(
  { conversationId }: UseConversationPersistenceOptions,
): UseConversationPersistenceReturn {
  const queryClient = useQueryClient();
  const store = useStore();
  const { getConversationQuery, setConversationMutation } = useAtomValue(queriesAtom);
  const { data: conversationData, error: conversationError, refetch, isLoading, isFetching } = useQuery({
    ...getConversationQuery(conversationId!),
    queryKey: queryKeys.conversations.detail(conversationId!),
    enabled: !!conversationId,
  });
  const { mutationFn: setConversationFn } = setConversationMutation();
  const setConversationAction = useSetAtom(assistantConversationStateAtom);
  const bumpPendingSave = useSetAtom(bumpPendingSaveAtom);
  const setCurrentConversationId = useSetAtom(setCurrentConversationIdAtom);
  const upsertConversation = useSetAtom(upsertConversationAtom);
  const setSaveStatus = useSetAtom(saveStatusAtom);
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));

  const saveTokenRef = useRef(0);
  const tokenAtSaveRef = useRef(0);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const restoredIdRef = useRef<string | null>(null);
  const lastSavedIdRef = useRef<string | null>(null);

  const setConversation = useMutation({
    mutationFn: setConversationFn,
    onSuccess: (row) => {
      lastSavedIdRef.current = row.id;
      setSaveStatus({ conversationId: conversationIdRef.current ?? null, message: null, isDismissed: false });
      queryClient.setQueryData(queryKeys.conversations.detail(row.id), row);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      const savedAt = row.updatedAt ? new Date(row.updatedAt) : null;
      if (savedAt) {
        setConversationAction((prev) => {
          if (prev.id !== row.id) return prev;
          const prevAt = prev.updatedAt instanceof Date ? prev.updatedAt : null;
          if (prevAt && prevAt.getTime() >= savedAt.getTime()) return prev;
          return { ...prev, updatedAt: savedAt };
        });
      }
    },
    onError: (error) => {
      console.error("Failed to save conversation", error);
      lastSavedIdRef.current = null;
      if (tokenAtSaveRef.current === saveTokenRef.current) {
        setSaveStatus({
          conversationId: conversationIdRef.current ?? null,
          message: (error as Error).message,
          isDismissed: false,
        });
      }
    },
  });

  useEffect(() => {
    saveTokenRef.current += 1;
  }, [conversationId]);

  const readStateForSave = useAtomCallback((get) => get(assistantConversationStateAtom));

  // Subscribe to the save trigger before the restore effect runs so that any
  // pendingSave bump emitted by restore (e.g. after creating a conversation
  // from ?deckId) is observed and flushed to the DB.
  useEffect(() => {
    if (!conversationId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFiredAt = 0;

    const flush = (options: { cancelStreamingRuns?: boolean } = {}) => {
      timer = null;
      // Read the conversation state directly from the store map so we always
      // get the latest data regardless of which conversation is current.
      const storeState = store.get(conversationsAtom);
      const state = storeState[conversationId];
      if (!state) return;
      if (state.messages.length === 0 && state.activeRunId === null) return;

      // When `cancelStreamingRuns` is set, rewrite any in-flight runs to
      // "canceled" in the persisted snapshot. This is what the throttled
      // save, the pagehide/beforeunload handler, and the effect cleanup
      // all do, so that the persisted state stays consistent with what
      // normalizeRestoredConversation will surface on the next mount:
      // the user/assistant messages stay in place (because the runs are
      // no longer "streaming") and the title derived from the first user
      // message matches the visible content. Without this, a conversation
      // whose stream was cut short by the user closing the tab would
      // resurface as an empty row with a non-null title derived from
      // the dropped user message.
      //
      // The transform is only applied at persist time. The live
      // in-memory state continues to track the run as "streaming" until
      // the underlying stream actually ends.
      const persistState = options.cancelStreamingRuns ? cancelStreamingRuns(state) : state;

      const title = computeConversationTitle(persistState);
      const row: Conversation = {
        id: persistState.id,
        title,
        state: JSON.parse(JSON.stringify(persistState)),
        createdAt: persistState.createdAt,
        updatedAt: persistState.updatedAt ?? null,
      };
      const data: SetConversationData = {
        id: row.id,
        state: row.state,
        title,
        updatedAt: persistState.updatedAt,
      };
      tokenAtSaveRef.current = saveTokenRef.current;
      setConversation.mutate(data);
    };

    const handler = () => {
      if (restoredIdRef.current !== conversationId) return;
      if (lastSavedIdRef.current !== conversationId) return;
      // Check if this specific conversation has an active run.
      const isStreaming = store.get(conversationsAtom)[conversationId]?.activeRunId != null;
      const now = Date.now();
      const wait = isStreaming ? STREAM_SAVE_THROTTLE_MS : IDLE_SAVE_DEBOUNCE_MS;
      const sinceLast = now - lastFiredAt;
      const delay = Math.max(0, wait - sinceLast);

      if (timer) clearTimeout(timer);
      // Persist in-flight runs as "canceled" so a later race between
      // the throttled save's mutation and the pagehide/cleanup mutation
      // cannot resurrect a "streaming" snapshot. See the comment on
      // handlePageHide below for the full rationale.
      timer = setTimeout(() => flush({ cancelStreamingRuns: true }), delay);
      lastFiredAt = now + delay;
    };

    const unsub = store.sub(pendingSaveAtom, handler);

    const flushNow = (options: { cancelStreamingRuns?: boolean } = {}) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush(options);
    };

    // Every save path (throttled, pagehide, cleanup) writes streaming
    // runs as "canceled" so that the persisted snapshot stays consistent
    // with what normalizeRestoredConversation will surface on the next
    // mount: the user/assistant messages stay in place (because the
    // runs are no longer "streaming") and the title derived from the
    // first user message matches the visible content.
    //
    // Without this, a conversation whose stream was cut short by the
    // user closing the tab or reloading would resurface as an empty
    // row with a non-null title (because normalizeRestoredConversation
    // drops messages for runs whose status === "streaming" or
    // "failed").
    //
    // The cleanup only flushes when there is a pending throttled save
    // timer. The setConversation mutation object from React Query is a
    // new reference on every render, so unconditionally flushing in
    // the cleanup would cause the effect to re-run on every render and
    // dispatch an unbounded number of mutations. The pending-timer
    // guard breaks that cycle because once the timer is cleared,
    // subsequent cleanups are no-ops.
    const handlePageHide = () => flushNow({ cancelStreamingRuns: true });
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      unsub();
      if (timer) {
        clearTimeout(timer);
        flush({ cancelStreamingRuns: true });
      }
    };
  }, [store, conversationId, readStateForSave, setConversation]);

  useEffect(() => {
    if (!conversationId) return;
    if (restoredIdRef.current === conversationId) return;
    if (isLoading) return;
    if (isFetching && !conversationData) return;
    // Don't overwrite the atom with a fresh empty state when the query failed.
    // The UI will surface the error and offer a retry.
    if (conversationError) return;

    // Switch to the new conversation. This is a read-only swap — the old
    // conversation's state remains in conversationsAtom.
    setCurrentConversationId(conversationId);

    // If the store already has state for this id (e.g. it was created locally
    // on a cold start, or a background run kept it warm), keep it — do NOT
    // overwrite from the DB. This is the key behavioral change that lets
    // background runs survive conversation switches.
    const storeState = store.get(conversationsAtom);
    if (storeState[conversationId]) {
      restoredIdRef.current = conversationId;
      lastSavedIdRef.current = conversationId;
      bumpPendingSave();
      return;
    }

    const loaded = conversationData?.state;
    const coerced = coerceConversationState(loaded);
    let normalized = false;
    if (coerced) {
      const clean = normalizeRestoredConversation(coerced);
      if (clean) {
        upsertConversation(clean);
        normalized = true;
      } else {
        upsertConversation(coerced);
      }
    } else {
      const stored = readLastUsed();
      const fresh: ConversationState = {
        ...initialConversationState,
        id: conversationId,
        createdAt: new Date(),
        ...stored,
      };
      upsertConversation(fresh);
      normalized = true;
    }
    restoredIdRef.current = conversationId;
    lastSavedIdRef.current = conversationId;
    if (normalized) bumpPendingSave();
  }, [
    store,
    conversationId,
    conversationData,
    isLoading,
    isFetching,
    conversationError,
    setCurrentConversationId,
    upsertConversation,
    bumpPendingSave,
    readLastUsed,
  ]);

  return {
    handleDismissSave: dismissSaveStatus,
    isRestoring: !!conversationId && isLoading && restoredIdRef.current !== conversationId,
    loadError: conversationError ?? null,
    retryLoad: refetch,
  };
}
