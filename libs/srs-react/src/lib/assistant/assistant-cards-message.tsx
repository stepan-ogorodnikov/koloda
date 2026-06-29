import type { GeneratedCard } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AssistantCardsTable } from "./assistant-cards-table";
import type { CardStatus } from "./conversation-state";

export type AssistantCardsMessageProps = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  template: Template | null | undefined;
  templateUnavailable?: boolean;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  canAdd: boolean;
  isGenerating: boolean;
  isCanceled: boolean;
  isFailed: boolean;
  canRetry: boolean;
  onRetry: () => void;
  elapsedSeconds?: number;
  modelName?: string;
};

export function AssistantCardsMessage({
  runId,
  cards,
  cardStatuses,
  template,
  templateUnavailable = false,
  deckId,
  templateId,
  canAdd,
  isGenerating,
  isCanceled,
  isFailed,
  canRetry,
  onRetry,
  elapsedSeconds,
  modelName,
}: AssistantCardsMessageProps) {
  const { _ } = useLingui();

  if (!template && !templateUnavailable) return null;

  return (
    <AIChatMessageLayout role="assistant">
      {isGenerating && <AIChatMessageStatus state="pending" />}
      {isCanceled && (
        <div className="flex flex-col gap-2">
          {elapsedSeconds !== undefined && <AIChatMessageStatus state="canceled" elapsedSeconds={elapsedSeconds} />}
        </div>
      )}
      {isFailed && <AIChatMessageStatus state="failed" canRetry={canRetry} onRetry={onRetry} />}
      {!isGenerating && !isCanceled && !isFailed && templateUnavailable && (
        <p className="fg-level-3">
          {_(msg`assistant.template-unavailable`)}
        </p>
      )}
      {!isGenerating && !isCanceled && !isFailed && !templateUnavailable && template && cards.length > 0 && (
        <div className="flex flex-col gap-2">
          <AssistantCardsTable
            runId={runId}
            cards={cards}
            cardStatuses={cardStatuses}
            template={template}
            deckId={deckId}
            templateId={templateId}
            canAdd={canAdd}
            isGenerating={isGenerating}
          />
          {elapsedSeconds !== undefined && (
            <AIChatMessageStatus state="success" elapsedSeconds={elapsedSeconds} modelName={modelName} />
          )}
        </div>
      )}
      {!isGenerating && !isCanceled && !isFailed && !templateUnavailable && template && !cards.length && (
        <p className="fg-level-3">
          {_(msg`assistant.generated-no-cards`)}
        </p>
      )}
    </AIChatMessageLayout>
  );
}
