import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest, GeneratedCard } from "@koloda/ai";
import type { CardGenerationExecutor, CardGenerationStreamRequest, StreamResult } from "@koloda/ai-react";
import { useAssistantCardGeneration, useChatStream } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import { useCallback } from "react";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";
import { usePendingRunRefs } from "./use-pending-run-refs";

/**
 * Per-kind spec for {@link runStream}. The two stream transports diverge in
 * three places, not one:
 *   - `onValue` — the per-chunk callback (chat accumulates text + dispatches
 *     `updateAssistantText`; cards dispatch `addCard`), returning the updated
 *     accumulator.
 *   - the transport's *result shape* (chat returns `{ streamResult, usage }`;
 *     cards return `StreamResult`), which `finalize` adapts into the
 *     `StreamResult` consumed by `handleStreamResult`.
 *   - `finalize` — kind-specific post-stream dispatches *before* the terminal
 *     status: chat re-dispatches the final accumulated text on abort and
 *     dispatches `setUsage`; cards have nothing to do and just return the
 *     result. Returning `StreamResult` here is what lets the shared funnel
 *     feed the already-shared `handleStreamResult`.
 */
type RunExecution<TRequest, TValue, TResult, TAcc> = {
  mode: AIChatMode;
  transport: (request: TRequest, onValue: (v: TValue) => void) => Promise<TResult>;
  initial: TAcc;
  onValue: (acc: TAcc, value: TValue) => TAcc;
  finalize: (result: TResult, acc: TAcc) => StreamResult;
};

/**
 * Shared run funnel: transport → finalize → `handleStreamResult`, with
 * `pendingRunRefs.onComplete` always cleared in `finally`. Replacing the two
 * symmetric try/finally bodies removes the "keep both in sync" maintenance
 * burden without hiding the kind-specific finalize dispatches.
 */
async function runStream<TRequest, TValue, TResult, TAcc>(
  exec: RunExecution<TRequest, TValue, TResult, TAcc>,
  conversationId: string,
  runId: string,
  request: TRequest,
  handleStreamResult: (conversationId: string, result: StreamResult, runId: string) => void,
  onComplete: (mode: AIChatMode, runId: string) => void,
): Promise<void> {
  let acc = exec.initial;
  try {
    const result = await exec.transport(request, (v) => {
      acc = exec.onValue(acc, v);
    });
    const streamResult = exec.finalize(result, acc);
    handleStreamResult(conversationId, streamResult, runId);
  } finally {
    // WHY: Must clear even on abort/error. A stream aborted by a newer
    // start still fires this — pending refs guard against stale runIds.
    onComplete(exec.mode, runId);
  }
}

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
      await runStream(
        {
          mode: "chat",
          transport: streamChat,
          initial: "",
          onValue: (text, chunk) => {
            const currentText = text + chunk;
            dispatchToConversation(conversationId, ["updateAssistantText", { runId, text: currentText }]);
            return currentText;
          },
          finalize: ({ streamResult, usage }, currentText) => {
            // WHY: On abort the stream hook stops calling onChunk mid-text;
            // re-dispatch the final accumulated value so the persisted
            // assistant message reflects everything received.
            if (streamResult === "aborted") {
              dispatchToConversation(conversationId, ["updateAssistantText", { runId, text: currentText }]);
            }
            if (usage) dispatchToConversation(conversationId, ["setUsage", { runId, usage }]);
            return streamResult;
          },
        },
        conversationId,
        runId,
        request,
        handleStreamResult,
        pendingRunRefs.onComplete,
      );
    },
    [dispatchToConversation, streamChat, handleStreamResult, pendingRunRefs],
  );

  const executeGenerateRun = useCallback(
    async (conversationId: string, runId: string, request: CardGenerationStreamRequest) => {
      await runStream<CardGenerationStreamRequest, GeneratedCard, StreamResult, null>(
        {
          mode: "cards",
          transport: generate,
          initial: null,
          onValue: (_acc, card) => {
            dispatchToConversation(conversationId, ["addCard", { runId, card }]);
            return null;
          },
          finalize: (result) => result,
        },
        conversationId,
        runId,
        request,
        handleStreamResult,
        pendingRunRefs.onComplete,
      );
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
