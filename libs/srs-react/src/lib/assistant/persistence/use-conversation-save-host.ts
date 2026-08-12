import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useLayoutEffect, useRef } from "react";
import {
  buildWriteConversation,
  ensureAssistantPersistenceHost,
  registerAssistantPersistenceWriteAdapter,
} from "../runs/use-assistant-engine-host";
import type { AssistantPersistenceWriteAdapter } from "../runs/use-assistant-engine-host";
import { dismissSaveStatusAtom, saveStatusAtom } from "../state/conversation-store";

export type UseConversationSaveHostReturn = {
  handleDismissSave: () => void;
};

/**
 * Application-shell persistence adapter. Scheduling and queue-map lifetime are
 * owned by the assistant engine (`ensureAssistantPersistenceHost`); this hook
 * only registers the React-side durable-write adapter while the shell is mounted.
 * Mount on the app shell (with `useAssistantEngineHost`), not the AI route.
 */
export function useConversationSaveHost(): UseConversationSaveHostReturn {
  const queryClient = useQueryClient();
  const store = useStore();
  const { setConversationMutation } = useAtomValue(queriesAtom);
  const { mutationFn: setConversationFn } = setConversationMutation();
  const setSaveStatus = useSetAtom(saveStatusAtom);
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);

  // WHY: Keep the latest React deps in a ref so the registered adapter stays
  // a stable plain object (safe for the module singleton) while still reading
  // fresh mutationFn / queryClient on each write. Do not use useEffectEvent —
  // Effect Events must not escape into a host that outlives the component.
  const depsRef = useRef({ store, setConversationFn, setSaveStatus, queryClient });
  depsRef.current = { store, setConversationFn, setSaveStatus, queryClient };

  const adapterRef = useRef<AssistantPersistenceWriteAdapter>({
    writeConversation: async () => {
      throw new Error("Assistant persistence write adapter is not ready");
    },
  });
  adapterRef.current.writeConversation = async (id: string): Promise<boolean> => {
    const {
      store: currentStore,
      setConversationFn: currentSetConversationFn,
      setSaveStatus: currentSetSaveStatus,
      queryClient: currentQueryClient,
    } = depsRef.current;
    if (!currentSetConversationFn) throw new Error("setConversationMutation is missing mutationFn");
    return buildWriteConversation({
      store: currentStore,
      // WHY: TanStack `MutationFunction` requires `(variables, context)`; the
      // persistence host keeps a single-arg durable-write signature.
      setConversationFn: (data) => currentSetConversationFn(data, { client: currentQueryClient, meta: undefined }),
      setSaveStatus: currentSetSaveStatus,
      setQueryConversation: (rowId, row) => {
        currentQueryClient.setQueryData(queryKeys.conversations.detail(rowId), row);
      },
      invalidateConversations: () => {
        currentQueryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      },
      isTombstoned: (conversationId) => ensureAssistantPersistenceHost(currentStore).isTombstoned(conversationId),
    })(id);
  };

  useLayoutEffect(() => {
    // WHY: commit registration in layout effect so an abandoned concurrent render
    // cannot replace the module slot without running cleanup.
    ensureAssistantPersistenceHost(store);
    // INVARIANT: clear the module slot on unmount so the singleton never keeps
    // a callback owned by an unmounted tree.
    return registerAssistantPersistenceWriteAdapter(adapterRef.current);
  }, [store]);

  return { handleDismissSave: dismissSaveStatus };
}
