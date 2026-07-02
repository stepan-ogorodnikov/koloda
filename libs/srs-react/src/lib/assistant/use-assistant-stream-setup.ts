import type { ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { useChatStream } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { assistantCancelFunctionsAtom } from "./assistant-conversation-atoms";
import type { ConversationAction, ConversationState } from "./conversation-state";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useConversationRuns } from "./use-conversation-runs";
import type { DispatchForConversation } from "./use-conversation-runs";
import { usePendingRunRefs } from "./use-pending-run-refs";

export type UseAssistantStreamSetupOptions = {
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
  dispatchAction: (action: ConversationAction) => void;
  dispatchFor: DispatchForConversation;
  readState: () => ConversationState;
};

export type UseAssistantStreamSetupReturn = {
  /** Arm the failure ref before starting a stream. */
  armPendingRun: (mode: AIChatMode, conversationId: string, runId: string) => void;
  /** Execute a chat stream run. */
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  /** Execute a card generation stream run. */
  executeGenerateRun: (
    conversationId: string,
    runId: string,
    request: CardGenerationStreamRequest,
  ) => Promise<void>;
  /** Retry a previous run. */
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  /** Cancel all in-flight streams. */
  cancel: () => void;
};

/**
 * Sets up the streaming infrastructure: stream hooks, error routing,
 * run execution, and cancel registration. This is the "plumbing" layer
 * that `useAssistantChat` delegates to.
 */
export function useAssistantStreamSetup({
  streamGenerator,
  chatStreamGenerator,
  dispatchAction,
  dispatchFor,
  readState,
}: UseAssistantStreamSetupOptions): UseAssistantStreamSetupReturn {
  // Centralised per-stream failure refs. `arm` must be called before starting
  // a stream; `handleError` is the onError callback for the stream hooks;
  // `onComplete` is called in the executor's finally block.
  const pendingRunRefs = usePendingRunRefs(dispatchFor);

  // Mode-bound wrappers so the stream hooks (which only know their own
  // stream type) can call into the centralised ref management.
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

  const setCancelFunctions = useSetAtom(assistantCancelFunctionsAtom);

  useEffect(() => {
    setCancelFunctions({ cancelGenerate, cancelChat });
  }, [cancelGenerate, cancelChat, setCancelFunctions]);

  const { executeChatRun, executeGenerateRun, retryRun } = useConversationRuns(
    streamChat,
    generate,
    dispatchAction,
    dispatchFor,
    readState,
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
