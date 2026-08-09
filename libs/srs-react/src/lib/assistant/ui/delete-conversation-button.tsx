import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ERROR_MESSAGES, isAppError } from "@koloda/app";
import type { DeleteConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useStore } from "jotai";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { deleteAssistantConversation } from "../runs/use-assistant-engine-host";

type DeleteConversationButtonProps = {
  id: DeleteConversationData["id"];
  onActiveDeleted?: () => void;
  isActive?: boolean;
};

export function DeleteConversationButton({ id, onActiveDeleted, isActive = false }: DeleteConversationButtonProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const store = useStore();
  const { deleteConversationMutation } = useAtomValue(queriesAtom);
  const [isOpen, setIsOpen] = useState(false);

  const { mutate, error, reset, isPending } = useMutation({
    mutationFn: async (data: DeleteConversationData) => {
      const { mutationFn } = deleteConversationMutation();
      if (!mutationFn) throw new Error("deleteConversationMutation is missing mutationFn");
      // WHY: delete must run through the persistence coordinator so an
      // in-flight upsert cannot recreate the row after DB delete (#8).
      await deleteAssistantConversation({
        store,
        conversationId: data.id,
        deleteFromDb: (conversationId) => mutationFn({ id: conversationId }, { client: queryClient, meta: undefined }),
        invalidateConversations: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
        },
        removeConversationQuery: (conversationId) => {
          queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
        },
      });
    },
  });

  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    if (value) reset();
  };

  const handleClick = () => {
    mutate(
      { id },
      {
        onSuccess: () => {
          setIsOpen(false);
          if (isActive) onActiveDeleted?.();
        },
      },
    );
  };

  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES["db.delete"];

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        variants={{ style: "ghost", size: "smallIcon", class: "rounded-md" }}
        aria-label={_(msg`ai.conversation.delete.trigger`)}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
      </Button>
      <Dialog.Popover placement="bottom">
        <Dialog.Body>
          <Dialog.Content variants={{ class: "items-center gap-4 max-w-[90vw] pt-4 pb-2" }}>
            <AnimatePresence mode="wait">
              {error ? (
                <Fade key="error">{typeof message === "function" ? _(message(error)) : _(message)}</Fade>
              ) : (
                <Fade key="message">{_(msg`ai.conversation.delete.message`)}</Fade>
              )}
            </AnimatePresence>
            <div className="flex flex-row items-center gap-4">
              <Button variants={{ style: "primary" }} onPress={handleClick} isDisabled={!!error || isPending}>
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
  );
}
