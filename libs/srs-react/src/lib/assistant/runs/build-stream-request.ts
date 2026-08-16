import type { AIChatMode, ChatStreamRequest, GenerateCardsInput, Message } from "@koloda/ai";
import { generateCardsInputSchema } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import type { DataAccessSnapshot } from "./data-access";

export type StreamRequestResult =
  | { kind: "chat"; request: ChatStreamRequest; templateFields: null }
  | { kind: "cards"; request: CardGenerationStreamRequest; templateFields: TemplateFields | null };

/** Build the provider request for a chat or cards run from current config + history. */
export function buildStreamRequest(
  cfg: AssistantConversationConfig,
  mode: AIChatMode,
  promptText: string,
  conversationMessages: Message[],
  dataAccess?: DataAccessSnapshot,
): StreamRequestResult {
  const input: GenerateCardsInput = generateCardsInputSchema.parse({
    modelId: cfg.modelId,
    prompt: promptText,
    temperature: cfg.temperature,
    reasoningEffort: cfg.reasoningEffort,
    ...(mode === "cards" && cfg.deckId != null ? { deckId: cfg.deckId } : {}),
    ...(mode === "cards" && cfg.templateId != null ? { templateId: cfg.templateId } : {}),
  });
  // WHY: an empty context (no decks) keeps the field absent — appending an
  // empty section must change nothing in the compiled system prompt.
  const dataContext = dataAccess?.context || undefined;

  if (mode === "chat") {
    return {
      kind: "chat",
      request: {
        input,
        messages: [...conversationMessages, { role: "user", content: promptText }],
        template: cfg.template ?? undefined,
        systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
        dataContext,
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
      dataContext,
    },
    templateFields: cfg.template?.content.fields ?? null,
  };
}
