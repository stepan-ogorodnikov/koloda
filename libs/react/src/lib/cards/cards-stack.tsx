import { cardsQueryKeys, queriesAtom } from "@koloda/react";
import type { Deck, Template } from "@koloda/srs";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AddCard } from "./add-card";
import { CardsStackItem } from "./cards-stack-item";
import { CardsViewToggle } from "./cards-view-toggle";

type CardsTableProps = {
  deckId: Deck["id"] | string;
  templateId: Template["id"] | string;
};

export function CardsStack({ deckId, templateId }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery } = useAtomValue(queriesAtom);
  const { data: cards = [] } = useQuery({
    queryKey: cardsQueryKeys.paginated({ deckId }),
    ...getCardsQuery({ deckId }),
  });
  const [index, setIndex] = useState(0);
  const card = cards[index];

  return (
    <>
      <div className="flex flex-row items-center justify-between gap-2">
        <CardsViewToggle />
        <div className="flex flex-row gap-2">
          <Button
            variants={{ style: "bordered", size: "icon" }}
            aria-label={_(msg`cards-stack.navigation.prev`)}
            isDisabled={index === 0}
            onClick={() => setIndex((prev) => (prev - 1))}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variants={{ style: "bordered", size: "icon" }}
            aria-label={_(msg`cards-stack.navigation.next`)}
            isDisabled={index >= cards.length - 1}
            onClick={() => setIndex((prev) => (prev + 1))}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        {cards.length > 0 && (
          <div className="flex flex-row items-center gap-1">
            <span className="numbers-text fg-level-2">{index + 1}</span>
            <span className="text-sm fg-level-4">/</span>
            <span className="numbers-text fg-level-2">{cards.length}</span>
          </div>
        )}
        <AddCard deckId={Number(deckId)} templateId={Number(templateId)} />
      </div>
      <div className="flex flex-col">
        {card && <CardsStackItem card={card} />}
      </div>
    </>
  );
}
