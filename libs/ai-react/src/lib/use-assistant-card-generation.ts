import type { GenerateCardsInput, GeneratedCard, Message } from "@koloda/ai";
import { useCallback } from "react";
import { type StreamResult, useStreamingRequest } from "./use-streaming-request";

export type CardGenerationStreamRequest = {
  input: GenerateCardsInput;
  messages: Message[];
  systemPromptTemplate?: string;
};

export type CardGenerationExecutor = (
  request: CardGenerationStreamRequest,
  onCard: (card: GeneratedCard) => void,
  signal: AbortSignal,
) => Promise<void>;

export type UseAssistantCardGenerationReturn = {
  cards: GeneratedCard[];
  isGenerating: boolean;
  error: Error | null;
  generate: (request: CardGenerationStreamRequest, onCard?: (card: GeneratedCard) => void) => Promise<StreamResult>;
  clearCards: () => void;
  cancel: () => void;
};

/** Cards-mode stream transport — twin of `useChatStream` for structured card output. */
export function useAssistantCardGeneration(
  streamGenerator: CardGenerationExecutor,
  onError?: (error: Error) => void,
): UseAssistantCardGenerationReturn {
  const { data: cards, isRunning: isGenerating, error, start, cancel, reset: clearCards } = useStreamingRequest<
    GeneratedCard[],
    GeneratedCard,
    CardGenerationStreamRequest,
    void
  >({
    initialData: [],
    accumulate: (prev, card) => [...prev, card],
    executor: streamGenerator,
    onError,
  });

  const generate = useCallback(
    async (request: CardGenerationStreamRequest, onCard?: (card: GeneratedCard) => void) => {
      const { streamResult } = await start(request, onCard);
      return streamResult;
    },
    [start],
  );

  return { cards, isGenerating, error, generate, clearCards, cancel };
}
