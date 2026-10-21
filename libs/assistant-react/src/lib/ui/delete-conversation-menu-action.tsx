import { Button, DeleteIcon } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type DeleteConversationMenuActionProps = {
  onRequestConfirm: () => void;
};

export function DeleteConversationMenuAction({ onRequestConfirm }: DeleteConversationMenuActionProps) {
  const { _ } = useLingui();

  return (
    <Button variants={{ style: "ghost", class: "justify-start px-2" }} onPress={onRequestConfirm}>
      <DeleteIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
      {_(msg`ai.conversation.delete.action`)}
    </Button>
  );
}
