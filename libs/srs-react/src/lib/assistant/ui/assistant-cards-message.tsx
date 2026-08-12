import type { GeneratedCard } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AssistantCardsTable } from "./assistant-cards-table";
import type { CardStatus } from "../state/conversation-reducer";

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
  isInterrupted?: boolean;
  isFailed: boolean;
  canRetry: boolean;
  onRetry: () => void;
  elapsedSeconds?: number;
  startedAt: Date;
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
  isInterrupted = false,
  isFailed,
  canRetry,
  onRetry,
  elapsedSeconds,
  startedAt,
  modelName,
}: AssistantCardsMessageProps) {
  const { _ } = useLingui();

  if (!template && !templateUnavailable) return null;

  const isTerminal = isCanceled || isInterrupted || isFailed;
  const isSuccess = !isGenerating && !isTerminal;
  // WHY: Partial cards already received must stay visible beside terminal
  // status (failed / canceled / interrupted); hiding them drops recoverable output.
  const showCards = !templateUnavailable && !!template && cards.length > 0;

  return (
    <AIChatMessageLayout role="assistant">
      {isGenerating && <AIChatMessageStatus state="pending" startedAt={startedAt} />}
      {showCards && (
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
      )}
      {isCanceled && (
        <AIChatMessageStatus state="canceled" elapsedSeconds={elapsedSeconds} canRetry={canRetry} onRetry={onRetry} />
      )}
      {isInterrupted && (
        <AIChatMessageStatus
          state="interrupted"
          elapsedSeconds={elapsedSeconds}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      )}
      {isFailed && <AIChatMessageStatus state="failed" canRetry={canRetry} onRetry={onRetry} />}
      {isSuccess && elapsedSeconds !== undefined && showCards && (
        <AIChatMessageStatus state="success" elapsedSeconds={elapsedSeconds} modelName={modelName} />
      )}
      {isSuccess && templateUnavailable && <p className="fg-level-3">{_(msg`assistant.template-unavailable`)}</p>}
      {isSuccess && !templateUnavailable && template && !cards.length && (
        <p className="fg-level-3">{_(msg`assistant.generated-no-cards`)}</p>
      )}
    </AIChatMessageLayout>
  );
}
