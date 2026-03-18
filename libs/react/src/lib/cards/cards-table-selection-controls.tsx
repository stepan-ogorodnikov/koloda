import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Card, Deck } from "@koloda/srs";
import { Button, Dialog, Fade, Number } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { Trash2, X } from "lucide-react";
import { useState } from "react";

type CardsTableSelectionControlsProps = {
  rowSelection: RowSelectionState;
  filteredCards: Card[];
  deckId: Deck["id"];
  onClearSelection: () => void;
};

export function CardsTableSelectionControls({
  rowSelection,
  filteredCards,
  deckId,
  onClearSelection,
}: CardsTableSelectionControlsProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { deleteCardMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(deleteCardMutation());
  const [isOpen, setIsOpen] = useState(false);

  const selectedCount = Object.keys(rowSelection).length;
  const selectedIds = Object.keys(rowSelection)
    .map((index) => filteredCards[parseInt(index)]?.id)
    .filter((id): id is Card["id"] => id !== undefined);

  const handleDelete = () => {
    selectedIds.forEach((id) => {
      mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
        },
      });
    });
    setIsOpen(false);
    onClearSelection();
  };

  return (
    <Fade className="sticky bottom-16 tb:bottom-2 flex justify-center">
      <div className="flex flex-row items-center gap-4 py-2 px-4 rounded-xl border-2 border-main bg-level-1">
        <div className="flex flex-row items-center gap-2">
          <Number value={selectedCount} />
          <span className="fg-level-1">
            {_(msg`${plural(selectedCount, { other: "cards-table.selection.label" })}`)}
          </span>
        </div>
        <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen} dismissableWithHotkey>
          <Button variants={{ style: "ghost" }} onClick={() => setIsOpen(true)}>
            <Trash2 className="size-5 stroke-1.75" aria-hidden="true" />
            <span>
              {_(msg`cards-table.selection.delete.trigger`)}
            </span>
          </Button>
          <Dialog.Popover variants={{ class: "my-2" }} placement="top">
            <Dialog.Body>
              <Dialog.Content variants={{ class: "items-center gap-2" }}>
                {_(msg`cards.table.selection.delete-confirm`)}
                <div className="flex flex-row items-center gap-4">
                  <Button variants={{ style: "primary", size: "small" }} onClick={handleDelete}>
                    {_(msg`cards-table.selection.delete.confirm`)}
                  </Button>
                  <Button variants={{ style: "ghost", size: "small" }} slot="close" autoFocus>
                    {_(msg`cards-table.selection.delete.cancel`)}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Body>
          </Dialog.Popover>
        </Dialog.Root>
        <Button
          variants={{ style: "ghost", size: "icon" }}
          aria-label={_(msg`cards-table.selection.clear`)}
          onClick={onClearSelection}
        >
          <X className="size-5 stroke-1.75" aria-hidden="true" />
        </Button>
      </div>
    </Fade>
  );
}
