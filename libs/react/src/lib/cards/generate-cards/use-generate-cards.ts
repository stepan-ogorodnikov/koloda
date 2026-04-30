import type { GenerateCardsInput, GeneratedCard } from "@koloda/srs";
import type { ModelMessage } from "ai";
import { useCallback } from "react";
import { type StreamResult, useStreamingRequest } from "./use-streaming-request";

export type GenerateCardsRequest = {
  input: GenerateCardsInput;
  messages: ModelMessage[];
  systemPromptTemplate?: string;
};

export type StreamGenerator = (
  request: GenerateCardsRequest,
  onCard: (card: GeneratedCard) => void,
  signal: AbortSignal,
) => Promise<void>;

export type UseGenerateCardsReturn = {
  cards: GeneratedCard[];
  isGenerating: boolean;
  error: Error | null;
  generate: (request: GenerateCardsRequest, onCard?: (card: GeneratedCard) => void) => Promise<StreamResult>;
  clearCards: () => void;
  cancel: () => void;
};

export function useGenerateCards(streamGenerator: StreamGenerator): UseGenerateCardsReturn {
  const { data: cards, isRunning: isGenerating, error, start, cancel, reset: clearCards } =
    useStreamingRequest<GeneratedCard[], GeneratedCard, GenerateCardsRequest, void>({
      initialData: [],
      accumulate: (prev, card) => [...prev, card],
      executor: streamGenerator,
    });

  const generate = useCallback(
    async (request: GenerateCardsRequest, onCard?: (card: GeneratedCard) => void) => {
      const { streamResult } = await start(request, onCard);
      return streamResult;
    },
    [start],
  );

  return { cards, isGenerating, error, generate, clearCards, cancel };
}
