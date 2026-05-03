import { Cancel01Icon, Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ERROR_MESSAGES, isAppError } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Card, Deck } from "@koloda/srs";
import { Button, Dialog, Fade, Number } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
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
  const { deleteCardsMutation } = useAtomValue(queriesAtom);
  const { mutate, error, reset } = useMutation(deleteCardsMutation());
  const [isOpen, setIsOpen] = useState(false);

  const selectedCount = Object.keys(rowSelection).length;
  const selectedIds = Object.keys(rowSelection)
    .map((index) => filteredCards[parseInt(index)]?.id)
    .filter((id): id is Card["id"] => id !== undefined);

  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    if (value) reset();
  };

  const handleDelete = () => {
    mutate({ ids: selectedIds }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
        setIsOpen(false);
        onClearSelection();
      },
    });
  };

  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES["db.delete"];

  return (
    <Fade className="sticky bottom-16 tb:bottom-2 flex justify-center">
      <div className="flex flex-row items-center gap-4 py-2 px-4 rounded-xl border-2 border-main bg-level-1">
        <div className="flex flex-row items-center gap-2">
          <Number value={selectedCount} />
          <span className="fg-level-1">
            {_(msg`${plural(selectedCount, { other: "cards-table.selection.label" })}`)}
          </span>
        </div>
        <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
          <Button variants={{ style: "ghost" }} onClick={() => setIsOpen(true)}>
            <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
            <span>
              {_(msg`cards-table.selection.delete.trigger`)}
            </span>
          </Button>
          <Dialog.Popover variants={{ class: "my-2" }} placement="top">
            <Dialog.Body>
              <Dialog.Content variants={{ class: "items-center gap-2" }}>
                <AnimatePresence>
                  {error
                    ? (
                      <Fade>
                        {typeof message === "function" ? _(message(error)) : _(message)}
                      </Fade>
                    )
                    : (
                      <Fade>
                        {_(msg`cards.table.selection.delete-confirm`)}
                      </Fade>
                    )}
                </AnimatePresence>
                <div className="flex flex-row items-center gap-4">
                  <Button variants={{ style: "primary", size: "small" }} onClick={handleDelete} isDisabled={!!error}>
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
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Cancel01Icon} aria-hidden="true" />
        </Button>
      </div>
    </Fade>
  );
}
