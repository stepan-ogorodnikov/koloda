import { getTextMessageContent } from "@koloda/ai";
import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { Template, TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import {
  assistantActiveRunIdAtom,
  assistantDeckIdAtom,
  assistantMessagesAtom,
  assistantRunsAtom,
} from "./assistant-conversation-atoms";
import { getChatTextMetadata, getErrorMetadata, getGeneratedCardsMetadata } from "./assistant-messages";
import { RevertMessageButton } from "./revert-message-button";

export type UseAssistantMessageRendererOptions = {
  templateId: Template["id"] | undefined;
  handleRetry: (runId: string) => Promise<void>;
  handleRevert: (userMessageId: string) => void;
};

export function useAssistantMessageRenderer(
  { templateId, handleRetry, handleRevert }: UseAssistantMessageRendererOptions,
) {
  const runs = useAtomValue(assistantRunsAtom);
  const messages = useAtomValue(assistantMessagesAtom);
  const activeRunId = useAtomValue(assistantActiveRunIdAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);
  const tailMessageId = messages.at(-1)?.id;

  return useCallback((message: UIMessage, content: ReactNode) => {
    if (message.role === "user") {
      return (
        <div className="group self-end flex flex-row items-center justify-end gap-1 w-full">
          <RevertMessageButton onPress={() => handleRevert(message.id)} />
          {content}
        </div>
      );
    }

    const isTail = message.id === tailMessageId;

    const generatedCardsMetadata = getGeneratedCardsMetadata(message);
    if (generatedCardsMetadata) {
      const run = runs[generatedCardsMetadata.runId];
      if (run?.mode === "cards") {
        const runCards = run.cards;
        const isCurrentRun = generatedCardsMetadata.runId === activeRunId;
        const templateFieldsMissing = run.templateFields === null;
        const cardsTemplate = run.templateFields ? makeHistoricalTemplate(run.templateFields) : null;

        if (cardsTemplate || templateFieldsMissing) {
          return (
            <AssistantCardsMessage
              runId={generatedCardsMetadata.runId}
              cards={runCards}
              cardStatuses={run.cardStatuses}
              template={cardsTemplate}
              templateUnavailable={templateFieldsMissing}
              deckId={deckId}
              templateId={templateId}
              canAdd={runCards.length > 0 && !isCurrentRun && deckId !== null}
              isGenerating={isCurrentRun}
              isCanceled={run.status === "canceled"}
              isFailed={run.status === "failed"}
              canRetry={isTail && !!run}
              onRetry={() => handleRetry(generatedCardsMetadata.runId)}
              elapsedSeconds={run.elapsedSeconds ?? undefined}
              modelName={run.modelName}
            />
          );
        }
      }
    }

    const errorMetadata = getErrorMetadata(message);
    if (errorMetadata) {
      return (
        <AIChatMessageLayout role="assistant">
          <AIChatMessageStatus
            state="failed"
            canRetry={isTail}
            onRetry={() => handleRetry(errorMetadata.runId)}
          />
        </AIChatMessageLayout>
      );
    }

    const chatMetadata = getChatTextMetadata(message);
    if (chatMetadata) {
      const run = runs[chatMetadata.runId];

      if (run) {
        if (run.status === "streaming") {
          if (getTextMessageContent(message)) return content;

          return (
            <AIChatMessageLayout role="assistant">
              <AIChatMessageStatus state="pending" />
            </AIChatMessageLayout>
          );
        }

        if (run.status === "success" && run.elapsedSeconds !== null) {
          return (
            <div className="flex flex-col gap-2 self-start w-full">
              {content}
              <AIChatMessageStatus state="success" elapsedSeconds={run.elapsedSeconds} modelName={run.modelName} />
            </div>
          );
        }

        if (run.status === "canceled" && run.elapsedSeconds !== null) {
          return (
            <div className="flex flex-col gap-2 self-start w-full">
              {content}
              <AIChatMessageStatus state="canceled" elapsedSeconds={run.elapsedSeconds} />
            </div>
          );
        }

        if (run.status === "failed") {
          return (
            <div className="flex flex-col gap-2 self-start w-full">
              {content}
              <AIChatMessageStatus
                state="failed"
                canRetry={isTail}
                onRetry={() => handleRetry(chatMetadata.runId)}
              />
            </div>
          );
        }
      }
    }

    return content;
  }, [tailMessageId, runs, activeRunId, templateId, deckId, handleRetry, handleRevert]);
}

function makeHistoricalTemplate(fields: TemplateFields): Template {
  return {
    id: 0,
    title: "",
    content: {
      fields,
      layout: fields.map((field) => ({ field: field.id, operation: "display" as const })),
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    isLocked: true,
  };
}
