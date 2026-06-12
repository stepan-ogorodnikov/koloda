import { AIChatMessageLayout, AIChatMessageStatus } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AssistantCardsMessage } from "./assistant-cards-message";
import { assistantActiveRunIdAtom, assistantMessagesAtom, assistantRunsAtom } from "./assistant-conversation-atoms";
import { getChatTextMetadata, getGeneratedCardsMetadata, getTextMessageContent } from "./assistant-messages";

export type UseAssistantMessageRendererOptions = {
  template: Template | null | undefined;
  deckId: Deck["id"];
  handleRetry: (runId: string) => Promise<void>;
};

export function useAssistantMessageRenderer(
  { template, deckId, handleRetry }: UseAssistantMessageRendererOptions,
) {
  const runs = useAtomValue(assistantRunsAtom);
  const messages = useAtomValue(assistantMessagesAtom);
  const activeRunId = useAtomValue(assistantActiveRunIdAtom);

  return useCallback(
    (message: UIMessage, content: ReactNode) => {
      const messageIndex = messages.findIndex((m) => m.id === message.id);
      const isTail = messageIndex >= 0 && messageIndex >= messages.length - 1;

      const generatedCardsMetadata = getGeneratedCardsMetadata(message);
      if (generatedCardsMetadata) {
        const run = runs[generatedCardsMetadata.runId];
        const runCards = run?.cards ?? [];
        const isCurrentRun = generatedCardsMetadata.runId === activeRunId;

        if (template) {
          return (
            <AssistantCardsMessage
              cards={runCards}
              template={template}
              deckId={deckId}
              templateId={template.id}
              canAdd={runCards.length > 0 && !isCurrentRun}
              isGenerating={isCurrentRun}
              isCanceled={run?.status === "canceled"}
              isFailed={run?.status === "failed"}
              canRetry={isTail && !!run}
              onRetry={() => handleRetry(generatedCardsMetadata.runId)}
              elapsedSeconds={run?.elapsedSeconds ?? undefined}
            />
          );
        }
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
                <AIChatMessageStatus state="success" elapsedSeconds={run.elapsedSeconds} />
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
    },
    [messages, runs, activeRunId, template, deckId, handleRetry],
  );
}
