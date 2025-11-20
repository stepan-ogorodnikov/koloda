import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Plus } from "lucide-react";
import { AddCard } from "../cards/add-card";
import { CardsTable } from "../cards/cards-table";
import { queriesAtom } from "../queries";

type Props = { deckId: string };

export function DeckCards({ deckId }: Props) {
  const { _ } = useLingui();
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const { data: deckData } = useQuery({ queryKey: ["decks", deckId], ...getDeckQuery(deckId) });

  return (
    <div className="flex flex-col gap-2 py-4 px-6">
      <div className="flex flex-row items-center">
        {deckData && (
          <Dialog.Root>
            <Button variants={{ style: "dashed" }}>
              <Plus className="size-4" />
              {_(msg`add-cards.trigger`)}
            </Button>
            <Dialog.Overlay>
              <Dialog.Modal variants={{ class: "min-w-84" }}>
                <Dialog.Body>
                  <AddCard deckId={Number(deckId)} templateId={deckData.templateId} />
                </Dialog.Body>
              </Dialog.Modal>
            </Dialog.Overlay>
          </Dialog.Root>
        )}
      </div>
      {deckData && <CardsTable deckId={deckId} templateId={deckData.templateId} />}
    </div>
  );
}
