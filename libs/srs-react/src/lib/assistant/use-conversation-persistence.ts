import { computeConversationTitle } from "@koloda/ai";
import type { SetConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useEffect, useEffectEvent, useRef } from "react";
import { aiProfileStateAtom, type AIProfileState } from "./ai-profile-state";
import { cancelStreamingRuns, normalizeRestoredConversation } from "./conversation-persistence";
import { coerceConversationState } from "./conversation-persistence-schema";
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

function restoreFromData(loaded: unknown): ConversationReducerState | null {
  const coerced = coerceConversationState(loaded);
  if (!coerced) return null;
  // WHY: fall back to the coerced state when normalize makes no changes so a row
  // that is already clean round-trips verbatim.
  return normalizeRestoredConversation(coerced) ?? coerced;
}

function freshConversation(id: string, stored: AIProfileState | null): ConversationReducerState {
  return { ...initialConversationState, id, createdAt: new Date(), ...stored };
}

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
  const restoredIdRef = useRef<string | null>(null);
  // WHY: Gate the pending-save handler until restore marks this id ready.
  // Written only by the restore effect — never by mutation callbacks — so a
  // late onSuccess/onError for a previous conversation cannot disable autosave
  // for the active one (and onError must not null it either). It is also never
  // reset on a `conversationId` switch: the restore effect overwrites it with
  // the new id, so nulling on switch would race the restore effect and re-gate
  // the active conversation's first autosave. Do not add a clear-on-change path.
  const lastSavedIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const { mutate: mutateConversation } = useMutation({
    mutationFn: setConversationFn,
    // WHY: capture the generation token per mutate. A shared ref would be
    // overwritten when B flushes, letting a late A callback pass the gate.
    onMutate: () => ({ saveToken: saveTokenRef.current }),
    onSuccess: (row, variables, context) => {
      // WHY: only update save UI for the active conversation's in-flight save.
      // Cache updates still apply to `row.id` either way.
      if (
        context?.saveToken === saveTokenRef.current &&
        variables.id === conversationIdRef.current
      ) {
        setSaveStatus({ conversationId: row.id, message: null, isDismissed: false });
      }
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
    onError: (error, variables, context) => {
      console.error("Failed to save conversation", error);
      if (
        context?.saveToken === saveTokenRef.current &&
        variables.id === conversationIdRef.current
      ) {
        setSaveStatus({
          conversationId: variables.id,
          message: (error as Error).message,
          isDismissed: false,
        });
      }
    },
  });

  useEffect(() => {
    saveTokenRef.current += 1;
  }, [conversationId]);

  // WHY: `useMutation`'s result object is not referentially stable. Keep flush
  // out of the subscription effect deps via useEffectEvent so pagehide /
  // beforeunload listeners and the pendingSave subscription are not torn down
  // on every render (same pattern as lesson-uploader).
  const flush = useEffectEvent((id: string, options: { cancelStreamingRuns?: boolean } = {}) => {
    const storeState = store.get(conversationsAtom);
    const state = storeState[id];
    if (!state) return;
    if (state.messages.length === 0 && state.activeRunId === null) return;

    const persistState = {
      // WHY: rewriting "streaming" runs to "canceled" prevents
      // `normalizeRestoredConversation` from dropping a run's messages on
      // next mount (leaving an empty row with a stale title). The live
      // in-memory state keeps "streaming" until the stream actually ends.
      ...(options.cancelStreamingRuns ? cancelStreamingRuns(state) : state),
      // WHY: revert is in-memory only (ASSISTANT-CHAT-CONVERSATIONS.md
      // §Revert); stripping it means reload never resurrects a hidden prefix.
      revertState: null,
    };

    const title = computeConversationTitle(persistState);
    const data: SetConversationData = {
      id: persistState.id,
      // WHY: structuredClone detaches persistState from the Jotai store so
      // the async mutation below doesn't capture a reference the reducer
      // will keep mutating. Unlike JSON.parse(JSON.stringify(...)) it
      // preserves Date instances; serialization to the jsonb column happens
      // at the DB layer.
      state: structuredClone(persistState),
      title,
      updatedAt: persistState.updatedAt,
    };
    mutateConversation(data);
  });

  // WHY: Subscribe to the save trigger before the restore effect runs so that any
  // pendingSave bump emitted by restore (e.g. after creating a conversation
  // from ?deckId) is observed and flushed to the DB.
  useEffect(() => {
    if (!conversationId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFiredAt = 0;

    const flushNow = (options: { cancelStreamingRuns?: boolean } = {}) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush(conversationId, options);
    };

    const scheduleFlush = () => {
      const isStreaming = store.get(conversationsAtom)[conversationId]?.activeRunId != null;
      const now = Date.now();
      const wait = isStreaming ? STREAM_SAVE_THROTTLE_MS : IDLE_SAVE_DEBOUNCE_MS;
      // WHY: clamp to `wait`. Without it, a pending idle schedule (lastFiredAt in
      // the future) plus a streaming bump computes delay > throttle window, so the
      // save never fires inside STREAM_SAVE_THROTTLE_MS. Clamping also resets
      // idle debounce to a full `wait` from the latest bump.
      const delay = Math.min(wait, Math.max(0, wait - (now - lastFiredAt)));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush(conversationId, { cancelStreamingRuns: true });
      }, delay);
      // WHY: track the scheduled fire time, not `now`, so back-to-back bumps
      // measure relative to the next fire and coalesce instead of cascading.
      lastFiredAt = now + delay;
    };

    const handler = () => {
      if (restoredIdRef.current !== conversationId) return;
      if (lastSavedIdRef.current !== conversationId) return;
      scheduleFlush();
    };

    const unsub = store.sub(pendingSaveAtom, handler);

    const handlePageHide = () => flushNow({ cancelStreamingRuns: true });
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    // WHY: only flush a pending timer on cleanup. An unconditional flush would
    // re-enter the mutation when conversationId changes before the restore
    // effect has marked the new id as saved.
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      unsub();
      if (timer) {
        clearTimeout(timer);
        flush(conversationId, { cancelStreamingRuns: true });
      }
    };
  }, [store, conversationId]); // oxlint-disable-line react/exhaustive-deps -- flush via useEffectEvent

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
      const restored = restoreFromData(conversationData?.state);
      upsertConversation(restored ?? freshConversation(conversationId, readLastUsed()));
    }
    restoredIdRef.current = conversationId;
    // WHY: overwrite (never null) — see the declaration's WHY. This is the only
    // writer; a switch does not clear it, only the next restore replaces it.
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
