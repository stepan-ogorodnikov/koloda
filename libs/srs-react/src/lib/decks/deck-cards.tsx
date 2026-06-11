import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck } from "@koloda/srs";
import { Link, QueryState, Tooltip, button, getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { AddCard } from "../cards/add-card";
import { CardsStack } from "../cards/cards-stack";
import { CardsTable } from "../cards/cards-table";
import { cardsViewAtom, CardsViewToggle } from "../cards/cards-view-toggle";

type DeckCardsProps = { deckId: Deck["id"] };

export function DeckCards({ deckId }: DeckCardsProps) {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);
  const { _ } = useLingui();
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
    <div className="flex flex-col gap-2 p-2 wd:p-4">
      <div className="flex flex-row items-center gap-4">
        <CardsViewToggle key="toggle" />
        <div className="grow flex flex-row" id="deck-cards-controls" ref={setPortalContainer} />
        <Tooltip content={_(msg`assistant.trigger`)}>
          <Link
            to="/ai"
            search={{ deckId: Number(deckId) }}
            className={button({ style: "dashed", size: "icon" })}
          >
            <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={AiMagicIcon} aria-hidden="true" />
          </Link>
        </Tooltip>
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
