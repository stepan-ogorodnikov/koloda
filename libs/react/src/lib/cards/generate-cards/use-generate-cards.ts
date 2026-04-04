import type { GenerateCardsInput, GeneratedCard } from "@koloda/srs";
import { isAbortError } from "@koloda/srs";
import type { ModelMessage } from "ai";
import { useCallback, useRef, useState } from "react";

export type GenerateCardsRequest = {
  input: GenerateCardsInput;
  messages: ModelMessage[];
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
  generate: (request: GenerateCardsRequest) => Promise<boolean>;
  clearCards: () => void;
  cancel: () => void;
};

export function useGenerateCards(streamGenerator: StreamGenerator): UseGenerateCardsReturn {
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (request: GenerateCardsRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsGenerating(true);
    setError(null);

    try {
      await streamGenerator(request, (card) => {
        if (!controller.signal.aborted) setCards((prev) => [...prev, card]);
      }, controller.signal);
      return true;
    } catch (e) {
      if (!controller.signal.aborted && !isAbortError(e)) setError(e instanceof Error ? e : new Error(String(e)));
      return false;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsGenerating(false);
      }
    }
  }, [streamGenerator]);

  const clearCards = useCallback(() => {
    setCards([]);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsGenerating(false);
  }, []);

  return { cards, isGenerating, error, generate, clearCards, cancel };
}
