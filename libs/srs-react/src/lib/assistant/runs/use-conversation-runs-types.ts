import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { AssistantExecutionIdentity, CardGenerationStreamRequest } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import type { ConversationReducerAction } from "../state/conversation-reducer";

export type DispatchToConversation = (id: string, action: ConversationReducerAction) => void;

export type UseConversationRunsReturn = {
  executeChatRun: (
    conversationId: string,
    runId: string,
    request: ChatStreamRequest,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  executeGenerateRun: (
    conversationId: string,
    runId: string,
    request: CardGenerationStreamRequest,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  retryRun: (
    conversationId: string,
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName: string | undefined,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  cancel: (conversationId: string, runId: string) => void;
};
