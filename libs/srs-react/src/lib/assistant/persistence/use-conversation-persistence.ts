import { useSetAtom } from "jotai";
import { useConversationRestore } from "./use-conversation-restore";
import { dismissSaveStatusAtom } from "../state/conversation-store";

export type UseConversationPersistenceOptions = {
  conversationId: string | undefined;
};

export type UseConversationPersistenceReturn = {
  handleDismissSave: () => void;
  isRestoring: boolean;
  loadError: Error | null;
  retryLoad: () => Promise<unknown>;
};

/**
 * Per-chat restore + save-error dismiss. Autosave lives in
 * `useConversationSaveHost` at app/route scope so dirtying a background
 * conversation can flush without depending on this mount or on
 * saver-before-restore effect registration order.
 */
export function useConversationPersistence({
  conversationId,
}: UseConversationPersistenceOptions): UseConversationPersistenceReturn {
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);
  const { isRestoring, loadError, retryLoad } = useConversationRestore({ conversationId });

  return {
    handleDismissSave: dismissSaveStatus,
    isRestoring,
    loadError,
    retryLoad,
  };
}
