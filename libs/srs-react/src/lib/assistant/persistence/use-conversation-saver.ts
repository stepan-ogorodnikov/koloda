import { computeConversationTitle } from "@koloda/ai";
import type { SetConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffect, useEffectEvent, useRef } from "react";
import type { MutableRefObject } from "react";
import { cancelStreamingRuns, toPersistedState } from "./conversation-persistence";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  dismissSaveStatusAtom,
  pendingSaveAtom,
  saveStatusAtom,
} from "../state/conversation-store";
import { createSaveScheduler, IDLE_SAVE_DEBOUNCE_MS, STREAM_SAVE_THROTTLE_MS } from "./create-save-scheduler";

export type UseConversationSaverOptions = {
  conversationId: string | undefined;
  // WHY: shared with restore — see UseConversationRestoreOptions.
  restoredIdRef: MutableRefObject<string | null>;
  lastSavedIdRef: MutableRefObject<string | null>;
};

export type UseConversationSaverReturn = {
  handleDismissSave: () => void;
};

export function useConversationSaver({
  conversationId,
  restoredIdRef,
  lastSavedIdRef,
}: UseConversationSaverOptions): UseConversationSaverReturn {
  const queryClient = useQueryClient();
  const store = useStore();
  const { setConversationMutation } = useAtomValue(queriesAtom);
  const { mutationFn: setConversationFn } = setConversationMutation();
  const setConversationReducerAction = useSetAtom(assistantConversationStateAtom);
  const setSaveStatus = useSetAtom(saveStatusAtom);
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);

  const saveTokenRef = useRef(0);
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
      if (context?.saveToken === saveTokenRef.current && variables.id === conversationIdRef.current) {
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
      if (context?.saveToken === saveTokenRef.current && variables.id === conversationIdRef.current) {
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

    // WHY: rewriting "streaming" runs to "canceled" prevents
    // `normalizeRestoredConversation` from dropping a run's messages on
    // next mount (leaving an empty row with a stale title). The live
    // in-memory state keeps "streaming" until the stream actually ends.
    const liveState = options.cancelStreamingRuns ? cancelStreamingRuns(state) : state;
    const persistState = toPersistedState(liveState);

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
  // from ?deckId) is observed and flushed to the DB. The composer must call
  // this hook before `useConversationRestore` so effect order matches.
  useEffect(() => {
    if (!conversationId) return;

    const scheduler = createSaveScheduler({
      flush: (options) => flush(conversationId, options),
      throttleMs: STREAM_SAVE_THROTTLE_MS,
      debounceMs: IDLE_SAVE_DEBOUNCE_MS,
      isStreaming: () => store.get(conversationsAtom)[conversationId]?.activeRunId != null,
    });

    const handler = () => {
      if (restoredIdRef.current !== conversationId) return;
      if (lastSavedIdRef.current !== conversationId) return;
      scheduler.schedule();
    };

    const unsub = store.sub(pendingSaveAtom, handler);

    const handlePageHide = () => scheduler.flushNow({ cancelStreamingRuns: true });
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    // WHY: only flush a pending timer on cleanup. An unconditional flush would
    // re-enter the mutation when conversationId changes before the restore
    // effect has marked the new id as saved.
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      unsub();
      scheduler.flushIfPending();
    };
  }, [store, conversationId, restoredIdRef, lastSavedIdRef]); // oxlint-disable-line react/exhaustive-deps -- flush via useEffectEvent

  return {
    handleDismissSave: dismissSaveStatus,
  };
}
