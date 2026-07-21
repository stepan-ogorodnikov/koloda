import { computeConversationTitle } from "@koloda/ai";
import type { SetConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useEffect, useRef } from "react";
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  cancelStreamingRuns,
  coerceConversationState,
  normalizeRestoredConversation,
} from "./conversation-persistence";
import { initialConversationState } from "./conversation-reducer";
import type { ConversationReducerState } from "./conversation-reducer";
import {
  assistantConversationStateAtom,
  bumpPendingSaveAtom,
  conversationsAtom,
  dismissSaveStatusAtom,
  pendingSaveAtom,
  saveStatusAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";

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

export function useConversationPersistence({
  conversationId,
}: UseConversationPersistenceOptions): UseConversationPersistenceReturn {
  const queryClient = useQueryClient();
  const store = useStore();
  const { getConversationQuery, setConversationMutation } = useAtomValue(queriesAtom);
  const {
    data: conversationData,
    error: conversationError,
    refetch,
    isLoading,
    isFetching,
  } = useQuery({
    ...getConversationQuery(conversationId!),
    queryKey: queryKeys.conversations.detail(conversationId!),
    enabled: !!conversationId,
  });
  const { mutationFn: setConversationFn } = setConversationMutation();
  const setConversationReducerAction = useSetAtom(assistantConversationStateAtom);
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
        setConversationReducerAction((prev) => {
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

  // WHY: Subscribe to the save trigger before the restore effect runs so that any
  // pendingSave bump emitted by restore (e.g. after creating a conversation
  // from ?deckId) is observed and flushed to the DB.
  useEffect(() => {
    if (!conversationId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFiredAt = 0;

    const flush = (options: { cancelStreamingRuns?: boolean } = {}) => {
      timer = null;
      const storeState = store.get(conversationsAtom);
      const state = storeState[conversationId];
      if (!state) return;
      if (state.messages.length === 0 && state.activeRunId === null) return;

      // WHY: Persisting a "streaming" run would cause normalizeRestoredConversation
      // to drop its messages on next mount, leaving an empty row with a stale
      // title. Rewriting to "canceled" keeps messages visible and title correct.
      // The live in-memory state keeps "streaming" until the stream actually ends.
      const cancelApplied = options.cancelStreamingRuns ? cancelStreamingRuns(state) : state;
      // WHY: Revert is in-memory only (ASSISTANT-CHAT-CONVERSATIONS.md
      // §Revert). Strip the revert state from the persisted payload so
      // reload never resurrects a hidden prefix.
      const persistState = { ...cancelApplied, revertState: null };

      const title = computeConversationTitle(persistState);
      // WHY: structuredClone detaches persistState from the Jotai store so the
      // async mutation below doesn't capture a reference the reducer will
      // keep mutating. Unlike JSON.parse(JSON.stringify(...)) it preserves
      // Date instances; serialization to the jsonb column happens at the DB
      // layer.
      const data: SetConversationData = {
        id: persistState.id,
        state: structuredClone(persistState),
        title,
        updatedAt: persistState.updatedAt,
      };
      tokenAtSaveRef.current = saveTokenRef.current;
      setConversation.mutate(data);
    };

    const handler = () => {
      if (restoredIdRef.current !== conversationId) return;
      if (lastSavedIdRef.current !== conversationId) return;
      const isStreaming = store.get(conversationsAtom)[conversationId]?.activeRunId != null;
      const now = Date.now();
      const wait = isStreaming ? STREAM_SAVE_THROTTLE_MS : IDLE_SAVE_DEBOUNCE_MS;
      const sinceLast = now - lastFiredAt;
      const delay = Math.max(0, wait - sinceLast);

      if (timer) clearTimeout(timer);
      // WHY: See the handlePageHide comment for full rationale.
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

    // WHY: Same cancelStreamingRuns rationale as above. The cleanup only flushes
    // when there is a pending throttled save timer. Unconditionally flushing would
    // cause re-renders because the mutation ref changes every render.
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
    // WHY: Don't overwrite with a fresh empty state when the query failed.
    if (conversationError) return;

    // WHY: If the store already has state for this id (cold start or background
    // run), keep it — overwriting from DB would kill in-flight streams.
    const storeState = store.get(conversationsAtom);
    if (!storeState[conversationId]) {
      const loaded = conversationData?.state;
      const coerced = coerceConversationState(loaded);
      if (coerced) {
        const clean = normalizeRestoredConversation(coerced);
        if (clean) {
          upsertConversation(clean);
        } else {
          upsertConversation(coerced);
        }
      } else {
        const stored = readLastUsed();
        const fresh: ConversationReducerState = {
          ...initialConversationState,
          id: conversationId,
          createdAt: new Date(),
          ...stored,
        };
        upsertConversation(fresh);
      }
    }
    restoredIdRef.current = conversationId;
    lastSavedIdRef.current = conversationId;
    // WHY: Setting the current id AFTER the conversation is in the store
    // lets `setCurrentConversationIdAtom`'s mark-read side effect find
    // the latest run id and dispatch a `markRead`. The pending-save bump
    // below persists the refreshed `lastReadRunId` on first restore, so
    // a freshly opened conversation is not shown as unread on next load.
    setCurrentConversationId(conversationId);
    bumpPendingSave();
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

  // WHY: A conversation just created via `newConversationAtom` or
  // `cloneConversationAtom` is already in the store but its queryKey
  // has never been fetched, so `isLoading: true` on the first render
  // would briefly swap the chat branch for the restoring branch and
  // remount the prompt panel. Skip restoring when the id is already
  // in the store — the restore effect above uses the same condition
  // to decide whether to load from DB.
  return {
    handleDismissSave: dismissSaveStatus,
    isRestoring:
      !!conversationId &&
      isLoading &&
      restoredIdRef.current !== conversationId &&
      !store.get(conversationsAtom)[conversationId],
    loadError: conversationError ?? null,
    retryLoad: refetch,
  };
}
