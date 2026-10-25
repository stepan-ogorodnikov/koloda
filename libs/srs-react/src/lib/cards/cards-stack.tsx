import { queriesAtom } from "@koloda/core-react";
import type { Deck } from "@koloda/srs";
import { AnimatedNumber, ArrowLeftIcon, ArrowRightIcon, Button, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { CardDetails } from "./card-details";

type CardsTableProps = {
  deckId: Deck["id"];
  controlsNode: HTMLDivElement | null;
};

export function CardsStack({ deckId, controlsNode }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery } = useAtomValue(queriesAtom);
  const { data: cards = [] } = useQuery(getCardsQuery({ deckId }));
  const [index, setIndex] = useState(0);
  // WHY: a delete shrinks the list under the stored index; show the last card instead of none.
  const position = Math.min(index, Math.max(cards.length - 1, 0));
  const card = cards[position];

  return (
    <>
      {controlsNode &&
        createPortal(
          <div className="grow flex flex-row justify-center gap-4">
            <div className="flex flex-row gap-2">
              <Button
                variants={{ style: "bordered", size: "icon" }}
                aria-label={_(msg`cards-stack.navigation.prev`)}
                isDisabled={position === 0}
                onClick={() => setIndex(position - 1)}
              >
                <ArrowLeftIcon className="size-5 min-w-5" strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button
                variants={{ style: "bordered", size: "icon" }}
                aria-label={_(msg`cards-stack.navigation.next`)}
                isDisabled={position >= cards.length - 1}
                onClick={() => setIndex(position + 1)}
              >
                <ArrowRightIcon className="size-5 min-w-5" strokeWidth={2} aria-hidden="true" />
              </Button>
            </div>
            {cards.length > 0 && (
              <div className="flex flex-row items-center gap-1">
                <AnimatedNumber className="fg-level-2 numbers-text tabular-nums" value={position + 1} />
                <span className="text-sm fg-level-4">/</span>
                <AnimatedNumber className="fg-level-2 numbers-text tabular-nums" value={cards.length} />
              </div>
            )}
          </div>,
          controlsNode,
        )}
      <div className="flex flex-col relative">
        <AnimatePresence mode="popLayout">
          <Fade key={card?.id}>{card && <CardDetails card={card} key={card?.id} />}</Fade>
        </AnimatePresence>
      </div>
    </>
  );
}
