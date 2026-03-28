import { AIChatMessageLayout } from "@koloda/react";
import type { Deck, GeneratedCard, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { GeneratedCardsTable } from "./generated-cards-table";

export type GeneratedCardsMessageProps = {
  cards: GeneratedCard[];
  template: Template | null | undefined;
  deckId: Deck["id"];
  templateId: Template["id"];
  canAdd: boolean;
  isGenerating: boolean;
  isCanceled: boolean;
};

export function GeneratedCardsMessage({
  cards,
  template,
  deckId,
  templateId,
  canAdd,
  isGenerating,
  isCanceled,
}: GeneratedCardsMessageProps) {
  const { _ } = useLingui();

  if (!template) return null;

  return (
    <AIChatMessageLayout role="assistant">
      {isGenerating && (
        <p className="self-start animate-shimmer-text--fg-level-4/fg-level-1">
          {_(msg`generate-cards.generating`)}
        </p>
      )}
      {isCanceled && (
        <p className="fg-level-4">
          {_(msg`generate-cards.canceled`)}
        </p>
      )}
      {!isGenerating && !isCanceled && cards.length > 0 && (
        <GeneratedCardsTable
          cards={cards}
          template={template}
          deckId={deckId}
          templateId={templateId}
          canAdd={canAdd}
          isGenerating={isGenerating}
        />
      )}
      {!isGenerating && !isCanceled && !cards.length && (
        <p className="fg-level-3">
          {_(msg`generate-cards.generated-no-cards`)}
        </p>
      )}
    </AIChatMessageLayout>
  );
}
