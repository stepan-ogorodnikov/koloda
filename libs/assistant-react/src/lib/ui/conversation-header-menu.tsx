import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { assistantConversationHasContextAtom } from "../state/conversation-selectors";
import { CloneConversationButton } from "./clone-conversation-button";
import { DeleteConversationConfirmContent } from "./delete-conversation-confirm-dialog";
import { DeleteConversationMenuAction } from "./delete-conversation-menu-action";
import { useDeleteConversation } from "./use-delete-conversation";

export type ConversationHeaderMenuProps = {
  conversationId: string;
  onClone?: (newId: string) => void;
  onActiveDeleted?: () => void;
};

export function ConversationHeaderMenu({ conversationId, onClone, onActiveDeleted }: ConversationHeaderMenuProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const hasContextAtom = useMemo(() => assistantConversationHasContextAtom(conversationId), [conversationId]);
  const hasContext = useAtomValue(hasContextAtom);

  const finishDelete = () => {
    setShowDeleteConfirm(false);
    setIsOpen(false);
    onActiveDeleted?.();
  };

  const { deleteConversation, error, reset, isPending } = useDeleteConversation({
    id: conversationId,
    onSuccess: finishDelete,
    onError: () => setShowDeleteConfirm(true),
  });

  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    if (!value) {
      setShowDeleteConfirm(false);
      reset();
    } else if (!showDeleteConfirm) {
      reset();
    }
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        variants={{ style: "ghost", size: "smallIcon" }}
        aria-label={_(msg`ai.conversation.menu.trigger`)}
        isDisabled={!hasContext}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={MoreVerticalIcon} aria-hidden="true" />
      </Button>
      <Dialog.Popover placement="bottom end">
        {showDeleteConfirm ? (
          <DeleteConversationConfirmContent onConfirm={deleteConversation} isPending={isPending} error={error} />
        ) : (
          <Dialog.Body>
            <Dialog.Content variants={{ class: "min-w-48 p-1" }}>
              <CloneConversationButton id={conversationId} onClone={onClone} onClose={() => setIsOpen(false)} />
              <DeleteConversationMenuAction
                id={conversationId}
                onDraftDelete={() => {
                  setIsOpen(false);
                  deleteConversation();
                }}
                onRequestConfirm={() => {
                  setShowDeleteConfirm(true);
                  reset();
                }}
              />
            </Dialog.Content>
          </Dialog.Body>
        )}
      </Dialog.Popover>
    </Dialog.Root>
  );
}
