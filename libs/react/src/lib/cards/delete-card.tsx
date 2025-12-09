import { queriesAtom } from "@koloda/react";
import type { Card, Deck } from "@koloda/srs";
import { DeleteDialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

type DeleteDeckProps = {
  id: Card["id"];
  deckId: Deck["id"];
};

export function DeleteCard({ id, deckId }: DeleteDeckProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { deleteCardMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(deleteCardMutation());

  const handleConfirm = () => {
    mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["cards", `${deckId}`] });
      },
    });
  };

  return (
    <DeleteDialog>
      <DeleteDialog.Trigger>
        {_(msg`delete-card.trigger`)}
      </DeleteDialog.Trigger>
      <DeleteDialog.Frame>
        {_(msg`delete-card.message`)}
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-card.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm}>{_(msg`delete-card.confirm`)}</DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
