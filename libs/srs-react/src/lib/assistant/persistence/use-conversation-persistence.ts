import { useSetAtom, useStore } from "jotai";
import { useCallback } from "react";
import { ensureAssistantPersistenceHost } from "../runs/use-assistant-engine-host";
import { useConversationRestore } from "./use-conversation-restore";
import { dismissSaveStatusAtom } from "../state/conversation-store";

export type UseConversationPersistenceOptions = {
  conversationId: string | undefined;
};

export type UseConversationPersistenceReturn = {
  handleDismissSave: () => void;
  retrySave: () => void;
  isRestoring: boolean;
  loadError: Error | null;
  retryLoad: () => Promise<unknown>;
};

/**
 * Per-chat restore + save-error dismiss/retry. Autosave lives in
 * `useConversationSaveHost` at application-shell scope so dirtying a
 * background conversation can flush without depending on this mount or on
 * saver-before-restore effect registration order.
 */
export function useConversationPersistence({
  conversationId,
}: UseConversationPersistenceOptions): UseConversationPersistenceReturn {
  const store = useStore();
  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);
  const { isRestoring, loadError, retryLoad } = useConversationRestore({ conversationId });

  const retrySave = useCallback(() => {
    if (!conversationId) return;
    ensureAssistantPersistenceHost(store).retrySave(conversationId);
  }, [conversationId, store]);

  return {
    handleDismissSave: dismissSaveStatus,
    retrySave,
    isRestoring,
    loadError,
    retryLoad,
  };
}
