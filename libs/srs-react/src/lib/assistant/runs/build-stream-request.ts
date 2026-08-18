import type { AssistantToolName, ChatStreamRequest, GenerateCardsInput, Message } from "@koloda/ai";
import { ASSISTANT_TOOL_SPECS, generateCardsInputSchema } from "@koloda/ai";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";

export type StreamRequestResult = {
  kind: "chat";
  request: ChatStreamRequest;
  templateFields: null;
};

// WHY: derive from the registry so adding a spec automatically advertises it;
// chat always sends the full set — AIModel has no tools capability field.
const CHAT_ASSISTANT_TOOL_NAMES: AssistantToolName[] = Object.keys(ASSISTANT_TOOL_SPECS) as AssistantToolName[];

/** Build the provider request for a chat run from current config + history. */
export function buildStreamRequest(
  cfg: AssistantConversationConfig,
  promptText: string,
  conversationMessages: Message[],
): StreamRequestResult {
  const input: GenerateCardsInput = generateCardsInputSchema.parse({
    modelId: cfg.modelId,
    prompt: promptText,
    temperature: cfg.temperature,
    reasoningEffort: cfg.reasoningEffort,
  });

  return {
    kind: "chat",
    request: {
      input,
      messages: [...conversationMessages, { role: "user", content: promptText }],
      template: cfg.template ?? undefined,
      systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
      tools: CHAT_ASSISTANT_TOOL_NAMES,
    },
    templateFields: null,
  };
}
