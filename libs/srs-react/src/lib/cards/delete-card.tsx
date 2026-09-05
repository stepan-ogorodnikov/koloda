import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Card, Deck } from "@koloda/srs";
import { DeleteDialog, ErrorMessage, Fade } from "@koloda/ui";
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
    mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
          queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all() });
        },
      },
    );
  };

  return (
    <DeleteDialog onOpenChange={handleOpenChange}>
      <DeleteDialog.Trigger>{_(msg`delete-card.trigger`)}</DeleteDialog.Trigger>
      <DeleteDialog.Frame>
        <AnimatePresence>
          {error ? (
            <Fade>
              <ErrorMessage {...formatAppError(error, _, ERROR_MESSAGES["db.delete"])} />
            </Fade>
          ) : (
            <Fade>{_(msg`delete-card.message`)}</Fade>
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
