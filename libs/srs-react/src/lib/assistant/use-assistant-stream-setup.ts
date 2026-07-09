import type { ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { useChatStream } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { assistantCancelFunctionsAtom } from "./assistant-conversation-atoms";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useConversationRuns } from "./use-conversation-runs";
import type { DispatchForConversation } from "./use-conversation-runs";
import { usePendingRunRefs } from "./use-pending-run-refs";

export type UseAssistantStreamSetupOptions = {
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
  dispatchAction: (action: ConversationReducerAction) => void;
  dispatchFor: DispatchForConversation;
  readState: () => ConversationReducerState;
  bumpPendingSave: () => void;
};

export type UseAssistantStreamSetupReturn = {
  armPendingRun: (mode: AIChatMode, conversationId: string, runId: string) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (
    conversationId: string,
    runId: string,
    request: CardGenerationStreamRequest,
  ) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  cancel: () => void;
};

export function useAssistantStreamSetup({
  streamGenerator,
  chatStreamGenerator,
  dispatchAction,
  dispatchFor,
  readState,
  bumpPendingSave,
}: UseAssistantStreamSetupOptions): UseAssistantStreamSetupReturn {
  const setCancelFunctions = useSetAtom(assistantCancelFunctionsAtom);
  const pendingRunRefs = usePendingRunRefs(dispatchFor);

  const handleChatStreamError = useCallback((error: Error) => (
    pendingRunRefs.handleError("chat", error)
  ), [pendingRunRefs]);

  const handleCardStreamError = useCallback((error: Error) => (
    pendingRunRefs.handleError("cards", error)
  ), [pendingRunRefs]);

  const onChatStreamComplete = useCallback((runId: string) => (
    pendingRunRefs.onComplete("chat", runId)
  ), [pendingRunRefs]);

  const onCardStreamComplete = useCallback((runId: string) => (
    pendingRunRefs.onComplete("cards", runId)
  ), [pendingRunRefs]);

  const { generate, cancel: cancelGenerate } = useAssistantCardGeneration(streamGenerator, handleCardStreamError);
  const { stream: streamChat, cancel: cancelChat } = useChatStream(chatStreamGenerator, handleChatStreamError);

  useEffect(() => {
    setCancelFunctions({ cancelGenerate, cancelChat });
  }, [cancelGenerate, cancelChat, setCancelFunctions]);

  const { executeChatRun, executeGenerateRun, retryRun } = useConversationRuns(
    streamChat,
    generate,
    dispatchAction,
    dispatchFor,
    readState,
    bumpPendingSave,
    onChatStreamComplete,
    onCardStreamComplete,
  );

  const cancel = useCallback(() => {
    cancelGenerate();
    cancelChat();
  }, [cancelGenerate, cancelChat]);

  return {
    armPendingRun: pendingRunRefs.arm,
    executeChatRun,
    executeGenerateRun,
    retryRun,
    cancel,
  };
}
