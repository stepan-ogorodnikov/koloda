import { ERROR_MESSAGES, isAppError } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck } from "@koloda/srs";
import { DeleteDialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";

type DeleteDeckProps = { id: Deck["id"] };

export function DeleteDeck({ id }: DeleteDeckProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const navigate = useNavigate({ from: "/decks/$deckId" });
  const { deleteDeckMutation } = useAtomValue(queriesAtom);
  const { mutate, error, reset } = useMutation(deleteDeckMutation());

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) reset();
  };

  const handleConfirm = () => {
    mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.decks.all() });
        queryClient.removeQueries({ queryKey: queryKeys.decks.detail(id) });
        navigate({ to: "/decks" });
      },
    });
  };

  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES["db.delete"];

  return (
    <DeleteDialog onOpenChange={handleOpenChange}>
      <DeleteDialog.Trigger>
        {_(msg`delete-deck.trigger`)}
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
                {_(msg`delete-deck.message`)}
              </Fade>
            )}
        </AnimatePresence>
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-deck.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm} isDisabled={!!error}>
            {_(msg`delete-deck.confirm`)}
          </DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
