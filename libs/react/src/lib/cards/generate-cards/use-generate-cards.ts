import type { GenerateCardsInput, GeneratedCard } from "@koloda/srs";
import { useCallback, useRef, useState } from "react";

export type StreamGenerator = (
  input: GenerateCardsInput,
  onCard: (card: GeneratedCard) => void,
  signal: AbortSignal,
) => Promise<void>;

export type UseGenerateCardsReturn = {
  cards: GeneratedCard[];
  isGenerating: boolean;
  error: Error | null;
  generate: (input: GenerateCardsInput) => Promise<boolean>;
  clearCards: () => void;
  cancel: () => void;
};

export function useGenerateCards(streamGenerator: StreamGenerator): UseGenerateCardsReturn {
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (input: GenerateCardsInput) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsGenerating(true);
    setError(null);

    try {
      await streamGenerator(input, (card) => {
        if (!controller.signal.aborted) setCards((prev) => [...prev, card]);
      }, controller.signal);
      return true;
    } catch (e) {
      if (!controller.signal.aborted && !isAbortError(e)) setError(e instanceof Error ? e : new Error(String(e)));
      return false;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setIsGenerating(false);
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
