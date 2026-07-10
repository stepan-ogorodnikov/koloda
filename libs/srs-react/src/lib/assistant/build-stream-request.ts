import type { AIChatMode, ChatStreamRequest, GenerateCardsInput, Message } from "@koloda/ai";
import { generateCardsInputSchema } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { AssistantConversationConfig } from "./assistant-conversation-config";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";

export type StreamRequestResult =
  | { kind: "chat"; request: ChatStreamRequest; templateFields: null }
  | { kind: "cards"; request: CardGenerationStreamRequest; templateFields: TemplateFields | null };

/** Build the provider request for a chat or cards run from current config + history. */
export function buildStreamRequest(
  cfg: AssistantConversationConfig,
  mode: AIChatMode,
  promptText: string,
  conversationMessages: Message[],
): StreamRequestResult {
  const input: GenerateCardsInput = generateCardsInputSchema.parse({
    modelId: cfg.modelId,
    prompt: promptText,
    temperature: cfg.temperature,
    reasoningEffort: cfg.reasoningEffort,
    ...(mode === "cards" && cfg.deckId != null ? { deckId: cfg.deckId } : {}),
    ...(mode === "cards" && cfg.templateId != null ? { templateId: cfg.templateId } : {}),
  });

  if (mode === "chat") {
    return {
      kind: "chat",
      request: {
        input,
        messages: [...conversationMessages, { role: "user", content: promptText }],
        template: cfg.template ?? undefined,
        systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
      },
      templateFields: null,
    };
  }

  return {
    kind: "cards",
    request: {
      input,
      messages: conversationMessages,
      systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
    },
    templateFields: cfg.template?.content.fields ?? null,
  };
}
