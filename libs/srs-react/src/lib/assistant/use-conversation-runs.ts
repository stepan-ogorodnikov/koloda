import type { ChatStreamRequest, StreamUsage } from "@koloda/ai";
import type { StreamResult } from "@koloda/ai-react";
import { useCallback } from "react";
import type { ConversationAction, ConversationState } from "./conversation-state";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";

export function useConversationRuns(
  streamChat: (
    request: ChatStreamRequest,
    onChunk: (chunk: string) => void,
  ) => Promise<{ streamResult: StreamResult; usage: StreamUsage | null }>,
  generate: (
    request: CardGenerationStreamRequest,
    onCard?: (card: { content: Record<string, { text: string }> }) => void,
  ) => Promise<StreamResult>,
  dispatch: React.Dispatch<ConversationAction>,
  getState: () => ConversationState,
) {
  const handleStreamResult = useCallback((result: StreamResult, runId: string) => {
    switch (result) {
      case "success":
        dispatch({ type: "completeRun", runId });
        break;
      case "error":
        dispatch({ type: "failRun", runId });
        break;
      case "aborted":
        dispatch({ type: "cancelRun", runId });
        break;
    }
  }, [dispatch]);

  const executeChatRun = useCallback(
    async (runId: string, request: ChatStreamRequest) => {
      let currentText = "";
      const { streamResult, usage } = await streamChat(request, (chunk) => {
        currentText += chunk;
        dispatch({ type: "updateAssistantText", runId, text: currentText });
      });

      if (streamResult === "aborted") dispatch({ type: "updateAssistantText", runId, text: currentText });

      if (usage) dispatch({ type: "setUsage", runId, usage });

      handleStreamResult(streamResult, runId);
    },
    [dispatch, streamChat, handleStreamResult],
  );

  const executeGenerateRun = useCallback(
    async (runId: string, request: CardGenerationStreamRequest) => {
      const result = await generate(request, (card) => {
        dispatch({ type: "addCard", runId, card });
      });

      handleStreamResult(result, runId);
      if (result === "success") dispatch({ type: "setMode", mode: "chat" });
    },
    [dispatch, generate, handleStreamResult],
  );

  const handleRetry = useCallback(
    async (runId: string) => {
      const run = getState().runs[runId];
      if (!run?.request) return;

      dispatch({ type: "restartRun", runId });

      if (run.mode === "chat") {
        dispatch({ type: "updateAssistantText", runId, text: "" });
        await executeChatRun(runId, run.request as ChatStreamRequest);
      } else {
        await executeGenerateRun(runId, run.request as CardGenerationStreamRequest);
      }
    },
    [executeChatRun, executeGenerateRun, dispatch, getState],
  );

  return { handleStreamResult, executeChatRun, executeGenerateRun, handleRetry };
}
