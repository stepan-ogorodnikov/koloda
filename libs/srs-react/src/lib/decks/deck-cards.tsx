import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck } from "@koloda/srs";
import { QueryState } from "@koloda/ui";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { AddCard } from "../cards/add-card";
import { AIChatDialog } from "../cards/ai-chat/ai-chat-dialog";
import { CardsStack } from "../cards/cards-stack";
import { CardsTable } from "../cards/cards-table";
import { cardsViewAtom, CardsViewToggle } from "../cards/cards-view-toggle";

type DeckCardsProps = { deckId: Deck["id"] };

export function DeckCards({ deckId }: DeckCardsProps) {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);
  const { getDeckQuery, getCardsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: queryKeys.decks.detail(deckId), ...getDeckQuery(deckId) });
  const query = useQuery({ queryKey: queryKeys.cards.deck({ deckId }), ...getCardsQuery({ deckId }) });
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
        <AIChatDialog deckId={Number(deckId)} templateId={data.templateId} key="ai-chat" />
        <AddCard deckId={Number(deckId)} templateId={data.templateId} key="add" />
      </div>
      <QueryState query={query}>
        {() => (
          <AnimatePresence mode="popLayout">
            {view === "stack" && <CardsStack deckId={deckId} controlsNode={portalContainer} key="stack" />}
            {view === "table" && <CardsTable deckId={deckId} controlsNode={portalContainer} key="table" />}
          </AnimatePresence>
        )}
      </QueryState>
    </div>
  );
}
