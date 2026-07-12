import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import type { CardGenerationExecutor, CardGenerationStreamRequest, StreamResult } from "@koloda/ai-react";
import { useAssistantCardGeneration, useChatStream } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import { useCallback } from "react";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";
import { usePendingRunRefs } from "./use-pending-run-refs";

export type DispatchToConversation = (id: string, action: ConversationReducerAction) => void;

export type UseConversationRunsOptions = {
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
  dispatchPersisted: (action: ConversationReducerAction) => void;
  dispatchToConversation: DispatchToConversation;
  readState: () => ConversationReducerState;
  bumpPendingSave: () => void;
};

export type UseConversationRunsReturn = {
  armPendingRun: (mode: AIChatMode, conversationId: string, runId: string) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (conversationId: string, runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  cancel: () => void;
};

/**
 * Wires chat/card stream transport to conversation run execution:
 * pending-run error routing, chunk/card dispatch, terminal status, retry.
 */
export function useConversationRuns({
  streamGenerator,
  chatStreamGenerator,
  dispatchPersisted,
  dispatchToConversation,
  readState,
  bumpPendingSave,
}: UseConversationRunsOptions): UseConversationRunsReturn {
  const pendingRunRefs = usePendingRunRefs(dispatchToConversation);

  const handleChatStreamError = useCallback(
    (error: Error) => pendingRunRefs.handleError("chat", error),
    [pendingRunRefs],
  );

  const handleCardStreamError = useCallback(
    (error: Error) => pendingRunRefs.handleError("cards", error),
    [pendingRunRefs],
  );

  const { generate, cancel: cancelGenerate } = useAssistantCardGeneration(streamGenerator, handleCardStreamError);
  const { stream: streamChat, cancel: cancelChat } = useChatStream(chatStreamGenerator, handleChatStreamError);

  const handleStreamResult = useCallback(
    (conversationId: string, result: StreamResult, runId: string) => {
      switch (result) {
        case "success":
          dispatchToConversation(conversationId, ["completeRun", { runId }]);
          // WHY: Force a save with the post-completion state so a
          // throttled save that fires during streaming cannot leave a
          // successful run persisted as "canceled" with elapsedSeconds: 0.
          bumpPendingSave();
          break;
        case "error":
          break;
        case "aborted":
          dispatchToConversation(conversationId, ["cancelRun", { runId }]);
          // WHY: Same rationale as success — the throttled save is still
          // queued from run start and would otherwise persist a "canceled"
          // snapshot derived from `cancelStreamingRuns` rather than the
          // real cancelRun terminal state.
          bumpPendingSave();
          break;
      }
    },
    [dispatchToConversation, bumpPendingSave],
  );

  const executeChatRun = useCallback(
    async (conversationId: string, runId: string, request: ChatStreamRequest) => {
      try {
        let currentText = "";
        const { streamResult, usage } = await streamChat(request, (chunk) => {
          currentText += chunk;
          dispatchToConversation(conversationId, ["updateAssistantText", { runId, text: currentText }]);
        });

        if (streamResult === "aborted") {
          dispatchToConversation(conversationId, ["updateAssistantText", { runId, text: currentText }]);
        }

        if (usage) dispatchToConversation(conversationId, ["setUsage", { runId, usage }]);

        handleStreamResult(conversationId, streamResult, runId);
      } finally {
        // WHY: Must clear even on abort/error. A stream aborted by a newer
        // start still fires this — pending refs guard against stale runIds.
        pendingRunRefs.onComplete("chat", runId);
      }
    },
    [dispatchToConversation, streamChat, handleStreamResult, pendingRunRefs],
  );

  const executeGenerateRun = useCallback(
    async (conversationId: string, runId: string, request: CardGenerationStreamRequest) => {
      try {
        const result = await generate(request, (card) => {
          dispatchToConversation(conversationId, ["addCard", { runId, card }]);
        });

        handleStreamResult(conversationId, result, runId);
      } finally {
        pendingRunRefs.onComplete("cards", runId);
      }
    },
    [dispatchToConversation, generate, handleStreamResult, pendingRunRefs],
  );

  const retryRun = useCallback(
    async (
      runId: string,
      request: ChatStreamRequest | CardGenerationStreamRequest,
      templateFields: TemplateFields | null,
      mode: AIChatMode,
      modelName?: string,
    ) => {
      const run = readState().runs[runId];
      const effectiveMode: AIChatMode = run?.mode ?? mode;

      dispatchPersisted(["restartRun", { runId, request, templateFields, mode: effectiveMode, modelName }]);

      if (effectiveMode === "chat") {
        dispatchPersisted(["updateAssistantText", { runId, text: "" }]);
        await executeChatRun(readState().id, runId, request as ChatStreamRequest);
      } else {
        await executeGenerateRun(readState().id, runId, request as CardGenerationStreamRequest);
      }
    },
    [executeChatRun, executeGenerateRun, dispatchPersisted, readState],
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
