import { AIChatMessageLayout } from "@koloda/react";
import type { Deck, GeneratedCard, Template } from "@koloda/srs";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AiChatMessageStatusPending } from "@koloda/react";
import { GeneratedCardsTable } from "./generated-cards-table";

export type GeneratedCardsMessageProps = {
  cards: GeneratedCard[];
  template: Template | null | undefined;
  deckId: Deck["id"];
  templateId: Template["id"];
  canAdd: boolean;
  isGenerating: boolean;
  isCanceled: boolean;
  isFailed: boolean;
  canRetry: boolean;
  onRetry: () => void;
};

export function GeneratedCardsMessage({
  cards,
  template,
  deckId,
  templateId,
  canAdd,
  isGenerating,
  isCanceled,
  isFailed,
  canRetry,
  onRetry,
}: GeneratedCardsMessageProps) {
  const { _ } = useLingui();

  if (!template) return null;

  return (
    <AIChatMessageLayout role="assistant">
      {isGenerating && (
        <AiChatMessageStatusPending label={_(msg`generate-cards.generate.generating`)} />
      )}
      {isCanceled && (
        <p className="fg-level-4">
          {_(msg`generate-cards.generate.canceled`)}
        </p>
      )}
      {isFailed && (
        <div className="flex flex-row flex-wrap items-center gap-2">
          <p className="fg-level-4">
            {_(msg`generate-cards.generate.failed`)}
          </p>
          {canRetry && (
            <Button
              variants={{ style: "ghost", size: "small", class: "fg-link hover:fg-link-hover" }}
              onPress={onRetry}
            >
              {_(msg`generate-cards.generate.retry`)}
            </Button>
          )}
        </div>
      )}
      {!isGenerating && !isCanceled && !isFailed && cards.length > 0 && (
        <GeneratedCardsTable
          cards={cards}
          template={template}
          deckId={deckId}
          templateId={templateId}
          canAdd={canAdd}
          isGenerating={isGenerating}
        />
      )}
      {!isGenerating && !isCanceled && !isFailed && !cards.length && (
        <p className="fg-level-3">
          {_(msg`generate-cards.generated-no-cards`)}
        </p>
      )}
    </AIChatMessageLayout>
  );
}
