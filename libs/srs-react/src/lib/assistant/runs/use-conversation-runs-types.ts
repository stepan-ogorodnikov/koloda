import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import type { ConversationReducerAction } from "../state/conversation-reducer";

export type DispatchToConversation = (id: string, action: ConversationReducerAction) => void;

export type UseConversationRunsOptions = {
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
};

export type UseConversationRunsReturn = {
  armPendingRun: (mode: AIChatMode, runId: string) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (conversationId: string, runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    conversationId: string,
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  cancel: (conversationId: string, runId: string) => void;
};
