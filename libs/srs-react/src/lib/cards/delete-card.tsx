import { ERROR_MESSAGES, isAppError } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Card, Deck } from "@koloda/srs";
import { DeleteDialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";

type DeleteDeckProps = {
  id: Card["id"];
  deckId: Deck["id"];
};

export function DeleteCard({ id, deckId }: DeleteDeckProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { deleteCardMutation } = useAtomValue(queriesAtom);
  const { mutate, error, reset } = useMutation(deleteCardMutation());

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) reset();
  };

  const handleConfirm = () => {
    mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
      },
    });
  };

  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES["db.delete"];

  return (
    <DeleteDialog onOpenChange={handleOpenChange}>
      <DeleteDialog.Trigger>
        {_(msg`delete-card.trigger`)}
      </DeleteDialog.Trigger>
      <DeleteDialog.Frame>
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
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-card.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm} isDisabled={!!error}>
            {_(msg`delete-card.confirm`)}
          </DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
