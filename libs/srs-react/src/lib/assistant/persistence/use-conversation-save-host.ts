import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffectEvent } from "react";
import { buildWriteConversation, ensureAssistantPersistenceHost } from "../runs/use-assistant-engine-host";
import { dismissSaveStatusAtom, saveStatusAtom } from "../state/conversation-store";

export type UseConversationSaveHostReturn = {
  handleDismissSave: () => void;
};

/**
 * Route-scoped persistence adapter. Scheduling and queue-map lifetime are
 * owned by the assistant engine (`ensureAssistantPersistenceHost`); this
 * hook only injects the React-side durable-write adapter.
 */
export function useConversationSaveHost(): UseConversationSaveHostReturn {
  const queryClient = useQueryClient();
  const store = useStore();
  const { setConversationMutation } = useAtomValue(queriesAtom);
  const { mutationFn: setConversationFn } = setConversationMutation();
  const setSaveStatus = useSetAtom(saveStatusAtom);
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);

  // WHY: `ensureAssistantPersistenceHost` captures `writeConversation` once when
  // wiring the singleton createWrite closure. useEffectEvent keeps that capture
  // stable across renders while still reading fresh `setConversationFn` /
  // queryClient on each write.
  const writeConversation = useEffectEvent(async (id: string): Promise<boolean> => {
    if (!setConversationFn) {
      throw new Error("setConversationMutation is missing mutationFn");
    }
    return buildWriteConversation({
      store,
      // WHY: TanStack `MutationFunction` requires `(variables, context)`; the
      // persistence host keeps a single-arg durable-write signature.
      setConversationFn: (data) => setConversationFn(data, { client: queryClient, meta: undefined }),
      setSaveStatus,
      setQueryConversation: (rowId, row) => {
        queryClient.setQueryData(queryKeys.conversations.detail(rowId), row);
      },
      invalidateConversations: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      },
    })(id);
  });

  ensureAssistantPersistenceHost(store, { writeConversation });

  return {
    handleDismissSave: dismissSaveStatus,
  };
}
