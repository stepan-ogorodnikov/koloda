import type { GeneratedCard } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AIChatCardsTable } from "./ai-chat-cards-table";

export type AIChatCardsMessageProps = {
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
  elapsedSeconds?: number;
};

export function AIChatCardsMessage({
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
  elapsedSeconds,
}: AIChatCardsMessageProps) {
  const { _ } = useLingui();

  if (!template) return null;

  return (
    <AIChatMessageLayout role="assistant">
      {isGenerating && <AIChatMessageStatus state="pending" />}
      {isCanceled && (
        <div className="flex flex-col gap-2">
          {elapsedSeconds !== undefined && <AIChatMessageStatus state="canceled" elapsedSeconds={elapsedSeconds} />}
        </div>
      )}
      {isFailed && <AIChatMessageStatus state="failed" canRetry={canRetry} onRetry={onRetry} />}
      {!isGenerating && !isCanceled && !isFailed && cards.length > 0 && (
        <div className="flex flex-col gap-2">
          <AIChatCardsTable
            cards={cards}
            template={template}
            deckId={deckId}
            templateId={templateId}
            canAdd={canAdd}
            isGenerating={isGenerating}
          />
          {elapsedSeconds !== undefined && <AIChatMessageStatus state="success" elapsedSeconds={elapsedSeconds} />}
        </div>
      )}
      {!isGenerating && !isCanceled && !isFailed && !cards.length && (
        <p className="fg-level-3">
          {_(msg`ai-chat.generated-no-cards`)}
        </p>
      )}
    </AIChatMessageLayout>
  );
}
