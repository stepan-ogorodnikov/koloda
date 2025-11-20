import { queriesAtom } from "@koloda/react";
import { DeleteDialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

type DeleteDeckProps = { id: string };

export function DeleteDeck({ id }: DeleteDeckProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const navigate = useNavigate({ from: "/decks/$deckId" });
  const { deleteDeckMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(deleteDeckMutation());

  const handleConfirm = () => {
    mutate({ id: Number(id) }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["decks"] });
        queryClient.removeQueries({ queryKey: ["decks", id] });
        navigate({ to: "/decks" });
      },
    });
  };

  return (
    <DeleteDialog>
      <DeleteDialog.Trigger>
        {_(msg`delete-deck.trigger`)}
      </DeleteDialog.Trigger>
      <DeleteDialog.Frame>
        {_(msg`delete-deck.message`)}
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-deck.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm}>{_(msg`delete-deck.confirm`)}</DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
