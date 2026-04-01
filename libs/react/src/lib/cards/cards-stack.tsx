import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck } from "@koloda/srs";
import { Button, Fade, Number } from "@koloda/ui";
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
  const { data: cards = [] } = useQuery({
    queryKey: queryKeys.cards.deck({ deckId }),
    ...getCardsQuery({ deckId }),
  });
  const [index, setIndex] = useState(0);
  const card = cards[index];

  return (
    <>
      {controlsNode && createPortal(
        <div className="grow flex flex-row justify-center gap-4">
          <div className="flex flex-row gap-2">
            <Button
              variants={{ style: "bordered", size: "icon" }}
              aria-label={_(msg`cards-stack.navigation.prev`)}
              isDisabled={index === 0}
              onClick={() => setIndex((prev) => (prev - 1))}
            >
              <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowLeft01Icon} aria-hidden="true" />
            </Button>
            <Button
              variants={{ style: "bordered", size: "icon" }}
              aria-label={_(msg`cards-stack.navigation.next`)}
              isDisabled={index >= cards.length - 1}
              onClick={() => setIndex((prev) => (prev + 1))}
            >
              <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowRight01Icon} aria-hidden="true" />
            </Button>
          </div>
          {cards.length > 0 && (
            <div className="flex flex-row items-center gap-1">
              <Number className="numbers-text fg-level-2" value={index + 1} />
              <span className="text-sm fg-level-4">/</span>
              <Number className="numbers-text fg-level-2" value={cards.length} />
            </div>
          )}
        </div>,
        controlsNode,
      )}
      <div className="flex flex-col relative">
        <AnimatePresence mode="popLayout">
          <Fade key={card?.id}>
            {card && <CardDetails card={card} key={card?.id} />}
          </Fade>
        </AnimatePresence>
      </div>
    </>
  );
}
