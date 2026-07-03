import type { ChatStreamRequest, StreamUsage } from "@koloda/ai";
import type { AIChatMode, StreamResult } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import { useCallback } from "react";
import type { ConversationAction, ConversationState } from "./conversation-state";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";

export type DispatchForConversation = (id: string, action: ConversationAction) => void;

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
  dispatchFor: DispatchForConversation,
  getState: () => ConversationState,
  // WHY: terminal-stream actions go through `dispatchFor` (per-id) so a
  // background stream on a non-current conversation still lands on the
  // originating conversation. `dispatchFor` does NOT bump the pending
  // save counter — without an explicit bump, the throttled save scheduled
  // at run start would fire during streaming and persist the run as
  // "canceled" (via `cancelStreamingRuns`) before the real terminal
  // status is ever saved.
  bumpPendingSave?: () => void,
  // WHY: Must be called even on abort/error so the caller can clear its
  // pending-failure ref. A stream aborted by a newer start will still
  // fire this — caller must guard the clear against stale runIds.
  onChatStreamComplete?: (runId: string) => void,
  onCardStreamComplete?: (runId: string) => void,
) {
  const handleStreamResult = useCallback((conversationId: string, result: StreamResult, runId: string) => {
    switch (result) {
      case "success":
        dispatchFor(conversationId, { type: "completeRun", runId });
        // WHY: Force a save with the post-completion state so a
        // throttled save that fires during streaming cannot leave a
        // successful run persisted as "canceled" with elapsedSeconds: 0.
        bumpPendingSave?.();
        break;
      case "error":
        break;
      case "aborted":
        dispatchFor(conversationId, { type: "cancelRun", runId });
        // WHY: Same rationale as success — the throttled save is still
        // queued from run start and would otherwise persist a "canceled"
        // snapshot derived from `cancelStreamingRuns` rather than the
        // real cancelRun terminal state.
        bumpPendingSave?.();
        break;
    }
  }, [dispatchFor, bumpPendingSave]);

  const executeChatRun = useCallback(
    async (conversationId: string, runId: string, request: ChatStreamRequest) => {
      try {
        let currentText = "";
        const { streamResult, usage } = await streamChat(request, (chunk) => {
          currentText += chunk;
          dispatchFor(conversationId, { type: "updateAssistantText", runId, text: currentText });
        });

        if (streamResult === "aborted") {
          dispatchFor(conversationId, { type: "updateAssistantText", runId, text: currentText });
        }

        if (usage) dispatchFor(conversationId, { type: "setUsage", runId, usage });

        handleStreamResult(conversationId, streamResult, runId);
      } finally {
        onChatStreamComplete?.(runId);
      }
    },
    [dispatchFor, streamChat, handleStreamResult, onChatStreamComplete],
  );

  const executeGenerateRun = useCallback(
    async (conversationId: string, runId: string, request: CardGenerationStreamRequest) => {
      try {
        const result = await generate(request, (card) => {
          dispatchFor(conversationId, { type: "addCard", runId, card });
        });

        handleStreamResult(conversationId, result, runId);
      } finally {
        onCardStreamComplete?.(runId);
      }
    },
    [dispatchFor, generate, handleStreamResult, onCardStreamComplete],
  );

  const retryRun = useCallback(
    async (
      runId: string,
      request: ChatStreamRequest | CardGenerationStreamRequest,
      templateFields: TemplateFields | null,
      mode: AIChatMode,
      modelName?: string,
    ) => {
      const run = getState().runs[runId];
      const effectiveMode: AIChatMode = run?.mode ?? mode;

      dispatch({ type: "restartRun", runId, request, templateFields, mode: effectiveMode, modelName });

      if (effectiveMode === "chat") {
        dispatch({ type: "updateAssistantText", runId, text: "" });
        await executeChatRun(getState().id, runId, request as ChatStreamRequest);
      } else {
        await executeGenerateRun(getState().id, runId, request as CardGenerationStreamRequest);
      }
    },
    [executeChatRun, executeGenerateRun, dispatch, getState],
  );

  return { handleStreamResult, executeChatRun, executeGenerateRun, retryRun };
}
