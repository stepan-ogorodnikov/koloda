import { z } from "zod";
import type { StreamUsage } from "./models";

export const generateCardsInputSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  reasoningEffort: z.string().optional(),
  deckId: z.int().positive().optional(),
  templateId: z.int().positive().optional(),
});

export type GenerateCardsInput = z.input<typeof generateCardsInputSchema>;

export type GeneratedCard = { content: Record<string, { text: string }> };

export type OnCardGenerated = (card: GeneratedCard) => void;

export type Message = { role: "user" | "assistant" | "system"; content: string };

/** Assistant chat operating mode: free-form text vs structured card generation. */
export type AIChatMode = "chat" | "cards";

export type CardGenerationFields = Array<{ id: number; title: string; isRequired: boolean; type?: string }>;

export type ChatStreamRequest = {
  messages: Message[];
  input: GenerateCardsInput;
  template?: { content: { fields: CardGenerationFields } };
  systemPromptTemplate?: string;
};

export type ChatStreamGenerator = (
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
) => Promise<StreamUsage | undefined>;

export type CardGenerationRequest = {
  template: { content: { fields: CardGenerationFields } };
  input: GenerateCardsInput;
  messages?: Message[];
  onCard: OnCardGenerated;
  abortSignal?: AbortSignal;
  systemPromptTemplate?: string;
};

export type GenerateCardsFunction = (request: CardGenerationRequest) => Promise<void>;
