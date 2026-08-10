import { ERROR_MESSAGES, isAppError } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { aiProfileStateAtom } from "../state/ai-profile-state";
import { newConversationAtom } from "../state/conversation-actions";
import { blockedConversationRestoreAtom, clearBlockedConversationRestore } from "../state/conversation-store";
import type { BlockedConversationRestore } from "../state/conversation-store";
import { deleteAssistantConversation } from "../runs/use-assistant-engine-host";

export type AssistantConversationRecoveryProps = {
  conversationId: string;
  blocked: BlockedConversationRestore;
  /** Called after the blocked row is deleted so the route can navigate away. */
  onDeleted?: () => void;
};

/**
 * Recovery screen for a conversation whose persisted row cannot be restored
 * (unsupportedVersion / corrupt). The stored row is never touched here —
 * reset and delete are explicit user actions and the only ways the row can be
 * removed or replaced. Delete reuses the coordinated delete path
 * (`deleteAssistantConversation`); reset deletes the row directly (a blocked
 * row has no queued writes, so no tombstone is needed) and then creates a
 * fresh current-version conversation under the same id.
 */
export function AssistantConversationRecovery({
  conversationId,
  blocked,
  onDeleted,
}: AssistantConversationRecoveryProps) {
  const { _ } = useLingui();
  const store = useStore();
  const queryClient = useQueryClient();
  const { deleteConversationMutation } = useAtomValue(queriesAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const setBlockedConversationRestore = useSetAtom(blockedConversationRestoreAtom);
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // WHY: The coordinated delete tombstones the id so a late upsert cannot
  // resurrect the row, then clears the blocked entry (and the DB row). It is
  // the single removal path for abandoned blocked rows.
  const removeBlockedRow = useCallback(async () => {
    const { mutationFn } = deleteConversationMutation();
    if (!mutationFn) throw new Error("deleteConversationMutation is missing mutationFn");
    await deleteAssistantConversation({
      store,
      conversationId,
      deleteFromDb: (id) => mutationFn({ id }, { client: queryClient, meta: undefined }),
      invalidateConversations: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      },
      removeConversationQuery: (conversationId) => {
        queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      },
    });
  }, [conversationId, deleteConversationMutation, queryClient, store]);

  // WHY: Reset keeps the conversation id, so it must NOT go through the
  // coordinated delete: `prepareDelete` tombstones the id and the tombstone is
  // only lifted when the pending-save counter disappears — a blocked row never
  // had one, so the fresh same-id conversation would be unsaveable for the
  // rest of the session. A blocked row has no queued/in-flight writes (it was
  // never inserted into the store), so a plain DB delete cannot race an
  // upsert. After the row is gone, create a fresh current-version conversation
  // under the same id; it stays empty (and unwritten) until the user adds
  // content.
  const {
    mutate: reset,
    isPending: isResetting,
    error: resetError,
    reset: clearResetError,
  } = useMutation({
    mutationFn: async () => {
      const { mutationFn } = deleteConversationMutation();
      if (!mutationFn) throw new Error("deleteConversationMutation is missing mutationFn");
      await mutationFn({ id: conversationId }, { client: queryClient, meta: undefined });
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      setBlockedConversationRestore((prev) => clearBlockedConversationRestore(prev, conversationId));
      const stored = readLastUsed();
      newConversation({ id: conversationId, ...stored });
    },
    onSuccess: () => setIsResetOpen(false),
  });

  const {
    mutate: remove,
    isPending: isDeleting,
    error: deleteError,
    reset: clearDeleteError,
  } = useMutation({
    mutationFn: async () => {
      await removeBlockedRow();
      onDeleted?.();
    },
    onSuccess: () => setIsDeleteOpen(false),
  });

  const handleResetOpenChange = (value: boolean) => {
    setIsResetOpen(value);
    if (value) clearResetError();
  };

  const handleDeleteOpenChange = (value: boolean) => {
    setIsDeleteOpen(value);
    if (value) clearDeleteError();
  };

  const message = isAppError(deleteError) ? ERROR_MESSAGES[deleteError.code] : ERROR_MESSAGES["db.delete"];

  return (
    <div className="grow flex flex-col items-center justify-center gap-6 py-12 px-4">
      <div className="flex flex-col items-center gap-2 text-center max-w-md">
        <p className="text-xl/6 font-bold fg-level-4">{_(msg`ai.conversation.recovery.title`)}</p>
        <p className="fg-level-2">
          {blocked.status === "unsupportedVersion"
            ? _(msg`ai.conversation.recovery.unsupported ${blocked.found} ${blocked.supported}`)
            : _(msg`ai.conversation.recovery.corrupt`)}
        </p>
        {blocked.status === "corrupt" && blocked.issues.length > 0 && (
          <ul className="text-sm fg-level-3 list-disc text-left">
            {blocked.issues.slice(0, 3).map((issue, index) => (
              <li key={`${issue.path}:${index}`}>
                {issue.message} <span className="fg-level-4">({issue.path})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-row items-center gap-4">
        <Button
          variants={{ style: "primary" }}
          aria-label={_(msg`ai.conversation.recovery.reset.trigger`)}
          onPress={() => handleResetOpenChange(true)}
        >
          {_(msg`ai.conversation.recovery.reset.trigger`)}
        </Button>
        <Button
          variants={{ style: "ghost" }}
          aria-label={_(msg`ai.conversation.delete.trigger`)}
          onPress={() => handleDeleteOpenChange(true)}
        >
          {_(msg`ai.conversation.delete.trigger`)}
        </Button>
      </div>
      <Dialog.Root isOpen={isResetOpen} onOpenChange={handleResetOpenChange}>
        <Dialog.Popover placement="bottom">
          <Dialog.Body>
            <Dialog.Content variants={{ class: "items-center gap-4 max-w-[90vw] pt-4 pb-2" }}>
              <AnimatePresence mode="wait">
                {resetError ? (
                  <Fade key="error">{_(msg`ai.conversation.recovery.reset.failed`)}</Fade>
                ) : (
                  <Fade key="message">{_(msg`ai.conversation.recovery.reset.message`)}</Fade>
                )}
              </AnimatePresence>
              <div className="flex flex-row items-center gap-4">
                <Button
                  variants={{ style: "primary" }}
                  onPress={() => reset()}
                  isDisabled={!!resetError || isResetting}
                >
                  {_(msg`ai.conversation.recovery.reset.confirm`)}
                </Button>
                <Button variants={{ style: "ghost" }} slot="close" autoFocus>
                  {_(msg`ai.conversation.recovery.reset.cancel`)}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Body>
        </Dialog.Popover>
      </Dialog.Root>
      <Dialog.Root isOpen={isDeleteOpen} onOpenChange={handleDeleteOpenChange}>
        <Dialog.Popover placement="bottom">
          <Dialog.Body>
            <Dialog.Content variants={{ class: "items-center gap-4 max-w-[90vw] pt-4 pb-2" }}>
              <AnimatePresence mode="wait">
                {deleteError ? (
                  <Fade key="error">{typeof message === "function" ? _(message(deleteError)) : _(message)}</Fade>
                ) : (
                  <Fade key="message">{_(msg`ai.conversation.delete.message`)}</Fade>
                )}
              </AnimatePresence>
              <div className="flex flex-row items-center gap-4">
                <Button
                  variants={{ style: "primary" }}
                  onPress={() => remove()}
                  isDisabled={!!deleteError || isDeleting}
                >
                  {_(msg`ai.conversation.delete.confirm`)}
                </Button>
                <Button variants={{ style: "ghost" }} slot="close" autoFocus>
                  {_(msg`ai.conversation.delete.cancel`)}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Body>
        </Dialog.Popover>
      </Dialog.Root>
    </div>
  );
}
