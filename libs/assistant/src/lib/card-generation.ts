import type { GenerateCardsInput, GeneratedCard, Message } from "@koloda/ai";
import type { StreamResult } from "./stream-result";

export type CardGenerationStreamRequest = {
  input: GenerateCardsInput;
  messages: Message[];
  systemPromptTemplate?: string;
  /** Always-on data context appended after the compiled system prompt. */
  dataContext?: string;
};

export type CardGenerationExecutor = (
  request: CardGenerationStreamRequest,
  onCard: (card: GeneratedCard) => void,
  signal: AbortSignal,
) => Promise<void>;

export type { StreamResult };
