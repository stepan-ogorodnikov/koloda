import type { UIMessage } from "ai";
import { useCallback } from "react";
import type { RefObject } from "react";
import type { AssistantCardsMessageProps } from "./assistant-cards-message";
import { getChatTextMetadata, getGeneratedCardsMetadata } from "./assistant-messages";
import type { ConversationState } from "./conversation-state";
import type { AssistantConversationConfig } from "./use-assistant-conversation";

export function useConversationMessageProps(
  stateRef: RefObject<ConversationState>,
  configRef: RefObject<AssistantConversationConfig>,
  handleRetry: (runId: string) => Promise<void>,
) {
  const getGeneratedCardsProps = useCallback(
    (message: UIMessage): AssistantCardsMessageProps | null => {
      const generatedCardsMetadata = getGeneratedCardsMetadata(message);
      if (!generatedCardsMetadata) return null;

      const currentState = stateRef.current;
      const cfg = configRef.current;
      if (!currentState || !cfg) return null;

      const run = currentState.runs[generatedCardsMetadata.runId];
      const runCards = run?.cards ?? [];
      const isCurrentRun = generatedCardsMetadata.runId === currentState.activeRunId;

      const messageIndex = currentState.messages.findIndex((m) => m.id === message.id);
      const canRetry = messageIndex >= currentState.messages.length - 1;

      return {
        cards: runCards,
        template: cfg.template,
        deckId: cfg.deckId,
        templateId: cfg.templateId,
        canAdd: runCards.length > 0 && !isCurrentRun,
        isGenerating: isCurrentRun,
        isCanceled: run?.status === "canceled",
        isFailed: run?.status === "failed",
        canRetry,
        onRetry: () => handleRetry(generatedCardsMetadata.runId),
        elapsedSeconds: run?.elapsedSeconds ?? undefined,
      };
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [handleRetry],
  );

  const getChatMessageProps = useCallback(
    (message: UIMessage):
      | { isStreaming: true }
      | { isSuccess: true; elapsedSeconds: number }
      | { isCanceled: true; elapsedSeconds: number }
      | { isFailed: true; canRetry: boolean; onRetry: () => void }
      | null =>
    {
      const chatMetadata = getChatTextMetadata(message);
      if (!chatMetadata) return null;

      const currentState = stateRef.current;
      if (!currentState) return null;

      const run = currentState.runs[chatMetadata.runId];

      if (!run) return null;

      if (run.status === "streaming") return { isStreaming: true };

      if (run.status === "success" && run.elapsedSeconds !== null) {
        return { isSuccess: true, elapsedSeconds: run.elapsedSeconds };
      }

      if (run.status === "canceled" && run.elapsedSeconds !== null) {
        return { isCanceled: true, elapsedSeconds: run.elapsedSeconds };
      }

      if (run.status !== "failed") return null;

      const messageIndex = currentState.messages.findIndex((m) => m.id === message.id);
      const canRetry = messageIndex >= currentState.messages.length - 1;

      return {
        isFailed: true,
        canRetry,
        onRetry: () => handleRetry(chatMetadata.runId),
      };
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [handleRetry],
  );

  return { getGeneratedCardsProps, getChatMessageProps };
}
