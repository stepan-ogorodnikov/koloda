import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import type { CardGenerationExecutor, CardGenerationStreamRequest, StreamResult } from "@koloda/ai-react";
import { isAbortError, isAppError } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import { useCallback, useEffect, useRef } from "react";
import type { ConversationReducerAction, ConversationReducerState } from "../state/conversation-reducer";
import { usePendingRunRefs } from "./use-pending-run-refs";

// WHY: AppError.message is the code; the human-readable text is `.details`.
function displayErrorMessage(error: Error): string {
  if (isAppError(error) && error.details) return error.details;
  return error.message || error.name || "unknown";
}

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
  dispatch: (action: ConversationReducerAction) => void;
  dispatchToConversation: DispatchToConversation;
  /** Mark a finished run read when `conversationId` is the current conversation. */
  markReadIfCurrent: (conversationId: string, runId: string) => void;
  readState: () => ConversationReducerState;
  touch: () => void;
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
  /** Abort only this run — concurrent streams on other conversations keep going. */
  cancel: (runId: string) => void;
};

/**
 * Wires chat/card stream transport to conversation run execution:
 * pending-run error routing, chunk/card dispatch, terminal status, retry.
 *
 * INVARIANT: Each in-flight run owns its own AbortController keyed by runId.
 * Singleton stream hooks cannot express concurrent same-mode runs across
 * conversations — canceling or starting another would abort the shared signal.
 */
export function useConversationRuns({
  streamGenerator,
  chatStreamGenerator,
  dispatch,
  dispatchToConversation,
  markReadIfCurrent,
  readState,
  touch,
}: UseConversationRunsOptions): UseConversationRunsReturn {
  const pendingRunRefs = usePendingRunRefs(dispatchToConversation, markReadIfCurrent);
  const controllersRef = useRef(new Map<string, AbortController>());
  const chatStreamGeneratorRef = useRef(chatStreamGenerator);
  chatStreamGeneratorRef.current = chatStreamGenerator;
  const streamGeneratorRef = useRef(streamGenerator);
  streamGeneratorRef.current = streamGenerator;

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  const beginRun = useCallback((runId: string) => {
    // WHY: Retry reuses runId; drop any leftover controller for that id first.
    controllersRef.current.get(runId)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(runId, controller);
    return controller;
  }, []);

  const endRun = useCallback((runId: string, controller: AbortController) => {
    if (controllersRef.current.get(runId) === controller) {
      controllersRef.current.delete(runId);
    }
  }, []);

  const handleStreamResult = useCallback(
    (conversationId: string, result: StreamResult, runId: string) => {
      switch (result) {
        case "success":
          dispatchToConversation(conversationId, ["completeRun", { runId }]);
          markReadIfCurrent(conversationId, runId);
          // WHY: Force a save with the post-completion state so a
          // throttled save that fires during streaming cannot leave a
          // successful run persisted as "canceled" with elapsedSeconds: 0.
          touch();
          break;
        case "error":
          break;
        case "aborted":
          dispatchToConversation(conversationId, ["cancelRun", { runId }]);
          markReadIfCurrent(conversationId, runId);
          // WHY: Same rationale as success — the throttled save is still
          // queued from run start and would otherwise persist a "canceled"
          // snapshot derived from `cancelStreamingRuns` rather than the
          // real cancelRun terminal state.
          touch();
          break;
      }
    },
    [dispatchToConversation, markReadIfCurrent, touch],
  );

  const executeChatRun = useCallback(
    async (conversationId: string, runId: string, request: ChatStreamRequest) => {
      await runStream(
        {
          mode: "chat",
          transport: async (req, onValue) => {
            const controller = beginRun(runId);
            try {
              const usage = await chatStreamGeneratorRef.current(
                req,
                (chunk) => {
                  if (!controller.signal.aborted) onValue(chunk);
                },
                controller.signal,
              );
              return { streamResult: "success" as const, usage: usage ?? null };
            } catch (e) {
              // WHY: Only AbortError means intentional cancel. A real Error must
              // surface even if the signal was also aborted.
              if (isAbortError(e)) {
                return { streamResult: "aborted" as const, usage: null as StreamUsage | null };
              }
              // WHY: Dispatch with this run's ids — a shared pending-ref would
              // mis-route when two same-mode streams are in flight.
              const error = e instanceof Error ? e : new Error(String(e));
              dispatchToConversation(conversationId, [
                "runFailed",
                { runId, error: { message: displayErrorMessage(error) } },
              ]);
              markReadIfCurrent(conversationId, runId);
              return { streamResult: "error" as const, usage: null as StreamUsage | null };
            } finally {
              endRun(runId, controller);
            }
          },
          initial: "",
          onValue: (text, chunk) => {
            const currentText = text + chunk;
            dispatchToConversation(conversationId, ["updateAssistantText", { runId, text: currentText }]);
            return currentText;
          },
          finalize: ({ streamResult, usage }, currentText) => {
            // WHY: On abort the stream stops calling onChunk mid-text;
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
    [beginRun, dispatchToConversation, endRun, handleStreamResult, markReadIfCurrent, pendingRunRefs],
  );

  const executeGenerateRun = useCallback(
    async (conversationId: string, runId: string, request: CardGenerationStreamRequest) => {
      await runStream<CardGenerationStreamRequest, GeneratedCard, StreamResult, null>(
        {
          mode: "cards",
          transport: async (req, onValue) => {
            const controller = beginRun(runId);
            try {
              await streamGeneratorRef.current(
                req,
                (card) => {
                  if (!controller.signal.aborted) onValue(card);
                },
                controller.signal,
              );
              return "success" as const;
            } catch (e) {
              if (isAbortError(e)) return "aborted" as const;
              const error = e instanceof Error ? e : new Error(String(e));
              dispatchToConversation(conversationId, [
                "runFailed",
                { runId, error: { message: displayErrorMessage(error) } },
              ]);
              markReadIfCurrent(conversationId, runId);
              return "error" as const;
            } finally {
              endRun(runId, controller);
            }
          },
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
    [beginRun, dispatchToConversation, endRun, handleStreamResult, markReadIfCurrent, pendingRunRefs],
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

      dispatch(["restartRun", { runId, templateFields, mode: effectiveMode, modelName }]);

      if (effectiveMode === "chat") {
        dispatch(["updateAssistantText", { runId, text: "" }]);
        await executeChatRun(readState().id, runId, request as ChatStreamRequest);
      } else {
        await executeGenerateRun(readState().id, runId, request as CardGenerationStreamRequest);
      }
    },
    [executeChatRun, executeGenerateRun, dispatch, readState],
  );

  // WHY: Concurrent runs (same or different mode, across conversations) each
  // own a controller. Cancel must abort only the run the user stopped.
  const cancel = useCallback((runId: string) => {
    const controller = controllersRef.current.get(runId);
    if (!controller) return;
    controller.abort();
    controllersRef.current.delete(runId);
  }, []);

  return {
    armPendingRun: pendingRunRefs.arm,
    executeChatRun,
    executeGenerateRun,
    retryRun,
    cancel,
  };
}
