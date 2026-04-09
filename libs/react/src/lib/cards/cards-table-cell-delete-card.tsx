import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import { ERROR_MESSAGES, isAppError } from "@koloda/srs";
import type { Card, Deck } from "@koloda/srs";
import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useState } from "react";

type CardsTableCellDeleteCardProps = {
  id: Card["id"];
  deckId: Deck["id"];
};

export function CardsTableCellDeleteCard({ id, deckId }: CardsTableCellDeleteCardProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { deleteCardMutation } = useAtomValue(queriesAtom);
  const { mutate, error, reset } = useMutation(deleteCardMutation());
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    if (value) reset();
  };

  const handleClick = () => {
    mutate({ id }, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
      },
    });
  };

  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : msg`db.delete`;

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange} dismissableWithHotkey>
      <Button
        variants={{ style: "ghost", size: "icon", class: "group w-full p-1 rounded-none no-focus-ring" }}
        aria-label={_(msg`delete-card.trigger`)}
      >
        <div className="p-1 rounded-md group-focus-ring">
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
        </div>
      </Button>
      <Dialog.Popover placement="left">
        <Dialog.Body>
          <Dialog.Content>
            <div className="flex flex-row items-center gap-4">
              <AnimatePresence>
                {error
                  ? (
                    <Fade>
                      {typeof message === "function" ? _(message(error)) : _(message)}
                    </Fade>
                  )
                  : (
                    <Fade>
                      {_(msg`delete-card.message`)}
                    </Fade>
                  )}
              </AnimatePresence>
              <Button variants={{ style: "primary", size: "small" }} onClick={handleClick} isDisabled={!!error}>
                {_(msg`delete-card.confirm`)}
              </Button>
              <Button variants={{ style: "ghost", size: "small" }} slot="close" autoFocus>
                {_(msg`delete-card.cancel`)}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
