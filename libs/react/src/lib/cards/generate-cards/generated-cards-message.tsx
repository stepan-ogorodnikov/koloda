import type { GeneratedCard } from "@koloda/ai";
import { AiChatElapsedTimeDisplay, AIChatMessageLayout } from "@koloda/ai-react";
import { AiChatMessageStatusPending } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import { Button } from "@koloda/ui";
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
  isFailed: boolean;
  canRetry: boolean;
  onRetry: () => void;
  elapsedSeconds?: number;
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
  elapsedSeconds,
}: GeneratedCardsMessageProps) {
  const { _ } = useLingui();

  if (!template) return null;

  return (
    <AIChatMessageLayout role="assistant">
      {isGenerating && <AiChatMessageStatusPending label={_(msg`ai.chat.message.status.pending`)} />}
      {isCanceled && (
        <div className="flex flex-col gap-2">
          {elapsedSeconds !== undefined && (
            <p className="fg-level-4 flex flex-row items-center gap-1">
              {_(msg`ai.chat.message.status.canceled-in`)}
              <AiChatElapsedTimeDisplay seconds={elapsedSeconds} />
            </p>
          )}
        </div>
      )}
      {isFailed && (
        <div className="flex flex-row flex-wrap items-center gap-2">
          <p className="fg-level-4">
            {_(msg`ai.chat.message.status.failed`)}
          </p>
          {canRetry && (
            <Button
              variants={{ style: "ghost", size: "small", class: "fg-link hover:fg-link-hover" }}
              onPress={onRetry}
            >
              {_(msg`ai.chat.message.retry`)}
            </Button>
          )}
        </div>
      )}
      {!isGenerating && !isCanceled && !isFailed && cards.length > 0 && (
        <div className="flex flex-col gap-2">
          <GeneratedCardsTable
            cards={cards}
            template={template}
            deckId={deckId}
            templateId={templateId}
            canAdd={canAdd}
            isGenerating={isGenerating}
          />
          {elapsedSeconds !== undefined && (
            <p className="fg-level-4 flex flex-row items-center gap-1">
              {_(msg`ai.chat.message.status.finished-in`)}
              <AiChatElapsedTimeDisplay seconds={elapsedSeconds} />
            </p>
          )}
        </div>
      )}
      {!isGenerating && !isCanceled && !isFailed && !cards.length && (
        <p className="fg-level-3">
          {_(msg`generate-cards.generated-no-cards`)}
        </p>
      )}
    </AIChatMessageLayout>
  );
}
