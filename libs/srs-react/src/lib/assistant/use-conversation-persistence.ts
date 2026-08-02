import { useRef } from "react";
import { useConversationRestore } from "./use-conversation-restore";
import { useConversationSaver } from "./use-conversation-saver";

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
  const restoredIdRef = useRef<string | null>(null);
  // WHY: Gate the pending-save handler until restore marks this id ready.
  // Written only by the restore effect — never by mutation callbacks — so a
  // late onSuccess/onError for a previous conversation cannot disable autosave
  // for the active one (and onError must not null it either). It is also never
  // reset on a `conversationId` switch: the restore effect overwrites it with
  // the new id, so nulling on switch would race the restore effect and re-gate
  // the active conversation's first autosave. Do not add a clear-on-change path.
  const lastSavedIdRef = useRef<string | null>(null);

  // INVARIANT: saver before restore — effect registration order must keep the
  // pendingSave subscription live before restore's `touch()`.
  const { handleDismissSave } = useConversationSaver({
    conversationId,
    restoredIdRef,
    lastSavedIdRef,
  });
  const { isRestoring, loadError, retryLoad } = useConversationRestore({
    conversationId,
    restoredIdRef,
    lastSavedIdRef,
  });

  return {
    handleDismissSave,
    isRestoring,
    loadError,
    retryLoad,
  };
}
