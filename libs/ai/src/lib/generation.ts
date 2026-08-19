import { z } from "zod";
import type { AssistantToolExecutor, OnToolEvent } from "./assistant-tools";
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

export type Message = { role: "user" | "assistant" | "system"; content: string };

export type ChatStreamRequest = {
  messages: Message[];
  input: GenerateCardsInput;
  systemPromptTemplate?: string;
  /** Tool names the model may call; names only so the request stays IPC-serializable. */
  tools?: string[];
  /** Host-supplied dispatcher for the tool names above; required when `tools` is non-empty. */
  executeTool?: AssistantToolExecutor;
  /** Streams tool activity back to the caller; stripped and recreated at the IPC boundary like `executeTool`. */
  onToolEvent?: OnToolEvent;
};

export type ChatStreamGenerator = (
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
) => Promise<StreamUsage | undefined>;
