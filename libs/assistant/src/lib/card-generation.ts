import type { GenerateCardsInput, GeneratedCard, Message } from "@koloda/ai";
import type { StreamResult } from "./stream-result";

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

export type { StreamResult };
