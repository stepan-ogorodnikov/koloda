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
import { removeConversationAtom } from "./assistant-conversation-atoms";

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
  const { mutate, error, reset } = useMutation(deleteConversationMutation());
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    if (value) reset();
  };

  const handleClick = () => {
    mutate(
      { id },
      {
        onSuccess: () => {
          // WHY: Drop the in-memory conversation before any re-render driven
          // by `onActiveDeleted` re-runs `useConversationPersistence` with
          // a new id. That hook's effect cleanup unconditionally calls
          // `flush` for the *previous* id when a debounce timer is pending,
          // and `flush` would otherwise re-insert the row via
          // `setConversation`'s upsert. Removing the state here makes
          // `flush`'s `if (!state) return` short-circuit.
          store.set(removeConversationAtom, id);
          setIsOpen(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
          queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(id) });
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
              <Button variants={{ style: "primary" }} onPress={handleClick} isDisabled={!!error}>
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
