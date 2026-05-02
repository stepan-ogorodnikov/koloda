import type { GenerateCardsInput, GeneratedCard, Message } from "@koloda/ai";
import type { StreamResult } from "@koloda/ai-react";
import { useStreamingRequest } from "@koloda/ai-react";
import { useCallback } from "react";

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

export type UseCardGenerationReturn = {
  cards: GeneratedCard[];
  isGenerating: boolean;
  error: Error | null;
  generate: (request: CardGenerationStreamRequest, onCard?: (card: GeneratedCard) => void) => Promise<StreamResult>;
  clearCards: () => void;
  cancel: () => void;
};

export function useCardGeneration(streamGenerator: CardGenerationExecutor): UseCardGenerationReturn {
  const { data: cards, isRunning: isGenerating, error, start, cancel, reset: clearCards } = useStreamingRequest<
    GeneratedCard[],
    GeneratedCard,
    CardGenerationStreamRequest,
    void
  >({
    initialData: [],
    accumulate: (prev, card) => [...prev, card],
    executor: streamGenerator,
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
