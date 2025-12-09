import { cardsViewAtom } from "@koloda/react";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { CardsStack } from "../cards/cards-stack";
import { CardsTable } from "../cards/cards-table";
import { queriesAtom } from "../queries";

type DeckCardsProps = { deckId: string };

export function DeckCards({ deckId }: DeckCardsProps) {
  const isMobile = useMediaQuery("(width < 48rem)");
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["decks", deckId], ...getDeckQuery(deckId) });
  const [view, setView] = useAtom(cardsViewAtom);

  useEffect(() => {
    if (isMobile) setView("stack");
  }, [isMobile, setView]);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-2 p-2 tb:p-4">
      {view === "stack" && <CardsStack deckId={deckId} templateId={data.templateId} />}
      {view === "table" && <CardsTable deckId={deckId} templateId={data.templateId} />}
    </div>
  );
}
