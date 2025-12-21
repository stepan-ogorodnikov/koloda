import type { Deck, Template } from "@koloda/srs";
import { Button, FieldGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cardQueryKeys, queriesAtom } from "@koloda/react";
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
  const { data: cards = [] } = useQuery({ queryKey: cardQueryKeys.all({ deckId }), ...getCardsQuery({ deckId }) });
  const [index, setIndex] = useState(0);
  const card = cards[index];

  return (
    <>
      <div className="flex flex-row items-center justify-between gap-2">
        <CardsViewToggle />
        <FieldGroup variants={{ style: "button", size: "default" }}>
          <Button
            variants={{ style: "ghost", size: "icon", class: "h-full" }}
            aria-label={_(msg`cards-stack.navigation.prev`)}
            isDisabled={index === 0}
            onClick={() => setIndex((prev) => (prev - 1))}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variants={{ style: "ghost", size: "icon", class: "h-full" }}
            aria-label={_(msg`cards-stack.navigation.next`)}
            isDisabled={index >= cards.length - 1}
            onClick={() => setIndex((prev) => (prev + 1))}
          >
            <ChevronRight className="size-5" />
          </Button>
        </FieldGroup>
        {cards.length > 0 && (
          <div className="flex flex-row items-center gap-1">
            <span className="text-xl font-semibold">{index + 1}</span>
            <span className="text-sm fg-level-4">/</span>
            <span className="text-xl font-semibold">{cards.length}</span>
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
