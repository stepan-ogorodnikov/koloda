import type { GeneratedCard } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import { queriesAtom } from "@koloda/core-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AssistantCardsTable } from "./assistant-cards-table";
import type { CardStatus } from "../state/conversation-reducer";

export type AssistantCardsMessageProps = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  template: Template | null | undefined;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  canAdd: boolean;
  isGenerating: boolean;
  // WHY: chat proposals render run status below leftover text, not on the table.
  showStatus?: boolean;
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
  deckId,
  templateId,
  canAdd,
  isGenerating,
  showStatus = true,
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
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const liveTemplateQuery = useQuery({
    ...(templateId !== undefined
      ? getTemplateQuery(templateId)
      : { queryKey: ["assistant", "live-template", "none"] as const, queryFn: async () => null }),
    enabled: templateId !== undefined,
  });

  // WHY: §Card Display — if the write-target template is gone, keep the snapshot
  // table and mark it unavailable. Missing snapshot is a different case (copy
  // falls back to text); do not treat it as this marker.
  const isTemplateUnavailable =
    !!template && templateId !== undefined && liveTemplateQuery.isSuccess && liveTemplateQuery.data == null;

  if (!template) return null;

  const isTerminal = isCanceled || isInterrupted || isFailed;
  const isSuccess = !isGenerating && !isTerminal;
  // WHY: Partial cards already received must stay visible beside terminal
  // status (failed / canceled / interrupted); hiding them drops recoverable output.
  const showCards = cards.length > 0;

  return (
    <AIChatMessageLayout role="assistant">
      {showStatus && isGenerating && <AIChatMessageStatus state="pending" startedAt={startedAt} />}
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
          isTemplateUnavailable={isTemplateUnavailable}
        />
      )}
      {showStatus && isCanceled && (
        <AIChatMessageStatus state="canceled" elapsedSeconds={elapsedSeconds} canRetry={canRetry} onRetry={onRetry} />
      )}
      {showStatus && isInterrupted && (
        <AIChatMessageStatus
          state="interrupted"
          elapsedSeconds={elapsedSeconds}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      )}
      {showStatus && isFailed && <AIChatMessageStatus state="failed" canRetry={canRetry} onRetry={onRetry} />}
      {showStatus && isSuccess && elapsedSeconds !== undefined && showCards && (
        <AIChatMessageStatus state="success" elapsedSeconds={elapsedSeconds} modelName={modelName} />
      )}
      {isSuccess && !isTemplateUnavailable && !cards.length && (
        <p className="fg-level-3">{_(msg`assistant.generated-no-cards`)}</p>
      )}
    </AIChatMessageLayout>
  );
}
