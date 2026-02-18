import { cardsQueryKeys, queriesAtom } from "@koloda/react";
import type { Card, Deck } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Trash2 } from "lucide-react";
import { useState } from "react";

type CardsTableCellDeleteCardProps = {
  id: Card["id"];
  deckId: Deck["id"];
};

export function CardsTableCellDeleteCard({ id, deckId }: CardsTableCellDeleteCardProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { deleteCardMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(deleteCardMutation());
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    mutate({ id }, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: cardsQueryKeys.deck({ deckId }) });
      },
    });
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        variants={{ style: "ghost", size: "icon", class: "group w-full p-1 rounded-none no-focus-ring" }}
        aria-label={_(msg`delete-card.trigger`)}
      >
        <div className="p-1 rounded-md group-focus-ring">
          <Trash2 className="size-5 stroke-1.75" aria-hidden="true" />
        </div>
      </Button>
      <Dialog.Popover placement="left">
        <Dialog.Body>
          <Dialog.Content>
            <div className="flex flex-row items-center gap-4">
              {_(msg`delete-card.message`)}
              <Button variants={{ style: "primary", size: "small" }} onClick={handleClick}>
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
