import { cardsViewAtom, CardsViewToggle } from "@koloda/react";
import { decksQueryKeys, queriesAtom } from "@koloda/react";
import type { Deck } from "@koloda/srs";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { AddCard } from "../cards/add-card";
import { CardsStack } from "../cards/cards-stack";
import { CardsTable } from "../cards/cards-table";

type DeckCardsProps = { deckId: Deck["id"] };

export function DeckCards({ deckId }: DeckCardsProps) {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: decksQueryKeys.detail(deckId), ...getDeckQuery(deckId) });
  const [view, setView] = useAtom(cardsViewAtom);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isMobile) setView("stack");
  }, [isMobile, setView]);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-2 p-2 tb:p-4">
      <div className="flex flex-row items-center gap-4">
        <CardsViewToggle key="toggle" />
        <div className="grow flex flex-row" id="deck-cards-controls" ref={setPortalContainer} />
        <AddCard deckId={Number(deckId)} templateId={data.templateId} key="add" />
      </div>
      <AnimatePresence mode="wait">
        {view === "stack" && <CardsStack deckId={deckId} controlsNode={portalContainer} key="stack" />}
        {view === "table" && (
          <CardsTable deckId={deckId} templateId={data.templateId} controlsNode={portalContainer} key="table" />
        )}
      </AnimatePresence>
    </div>
  );
}
