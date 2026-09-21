import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import { DeleteConversationConfirmContent } from "./delete-conversation-confirm-dialog";
import { useDeleteConversation } from "./use-delete-conversation";

type DeleteConversationButtonProps = {
  id: Parameters<typeof useDeleteConversation>[0]["id"];
  hasTurns: boolean;
  onActiveDeleted?: () => void;
  isActive?: boolean;
};

export function DeleteConversationButton({
  id,
  hasTurns,
  onActiveDeleted,
  isActive = false,
}: DeleteConversationButtonProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  const { deleteConversation, error, reset, isPending } = useDeleteConversation({
    id,
    onSuccess: () => {
      setIsOpen(false);
      if (isActive) onActiveDeleted?.();
    },
    onError: () => setIsOpen(true),
  });

  const handleOpenChange = (value: boolean) => {
    // WHY: Drafts (no submitted run) skip confirmation. Keep the popover for
    // delete errors so the existing in-place error UI still has a home.
    if (value && !hasTurns) {
      deleteConversation();
      return;
    }
    setIsOpen(value);
    if (value) reset();
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        variants={{ style: "ghost", size: "smallIcon", class: "rounded-md" }}
        aria-label={_(msg`ai.conversation.delete.trigger`)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
      </Button>
      <Dialog.Popover placement="bottom">
        <DeleteConversationConfirmContent onConfirm={deleteConversation} isPending={isPending} error={error} />
      </Dialog.Popover>
    </Dialog.Root>
  );
}
