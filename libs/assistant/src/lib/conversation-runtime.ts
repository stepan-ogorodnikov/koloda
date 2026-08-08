import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import { isAbortError } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "./card-generation";
import { displayErrorMessage } from "./display-error";
import { runStream } from "./run-stream";
import { createSerialQueue } from "./serial-queue";
import type { StreamResult } from "./stream-result";

export type ConversationRuntimeCallbacks<TAction> = {
  dispatch: (action: TAction) => void;
  dispatchToConversation: (id: string, action: TAction) => void;
  markReadIfCurrent: (id: string, runId: string) => void;
  touch: (conversationId: string) => void;
  readState: () => { id: string; runs: Record<string, { mode?: AIChatMode }> };
};

export type ConversationRuntimeTransports = {
  getChatStreamGenerator: () => ChatStreamGenerator;
  getStreamGenerator: () => CardGenerationExecutor;
};

export type ConversationRuntime<TAction> = {
  conversationId: string;
  armPendingRun: (mode: AIChatMode, runId: string) => void;
  executeChatRun: (runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
};

export function createConversationRuntime<TAction>(
  conversationId: string,
  callbacks: ConversationRuntimeCallbacks<TAction>,
  transports: ConversationRuntimeTransports,
  controllerRegistry: {
    beginRun: (runId: string) => AbortController;
    endRun: (runId: string, controller: AbortController) => void;
  },
  pendingRunRefs: {
    arm: (mode: AIChatMode, runId: string) => void;
    onComplete: (mode: AIChatMode, runId: string) => void;
  },
): ConversationRuntime<TAction> {
  const queue = createSerialQueue<void>();

  const handleStreamResult = (targetConversationId: string, result: StreamResult, runId: string) => {
    switch (result) {
      case "success":
        callbacks.dispatchToConversation(targetConversationId, ["completeRun", { runId }] as TAction);
        callbacks.markReadIfCurrent(targetConversationId, runId);
        // WHY: Force a save with the post-completion state so a
        // throttled streaming checkpoint cannot outlive the terminal
        // success status on disk. Touch by originating id — viewing B
        // must not dirty B when A's background run finishes.
        callbacks.touch(targetConversationId);
        break;
      case "error":
        // WHY: `runFailed` was already dispatched in the transport catch;
        // still dirty the originating conversation so the failed terminal
        // status is scheduled for save.
        callbacks.touch(targetConversationId);
        break;
      case "aborted":
        callbacks.dispatchToConversation(targetConversationId, ["cancelRun", { runId }] as TAction);
        callbacks.markReadIfCurrent(targetConversationId, runId);
        // WHY: Same rationale as success — schedule a save with the real
        // cancelRun terminal state (`canceled`/`user`) rather than leaving
        // only the last streaming checkpoint on disk.
        callbacks.touch(targetConversationId);
        break;
    }
  };

  const runChatRun = (runId: string, request: ChatStreamRequest): Promise<void> =>
    runStream(
      {
        mode: "chat",
        transport: async (req, onValue) => {
          const controller = controllerRegistry.beginRun(runId);
          try {
            const usage = await transports.getChatStreamGenerator()(
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
            const error = e instanceof Error ? e : new Error(String(e));
            callbacks.dispatchToConversation(conversationId, [
              "runFailed",
              { runId, error: { message: displayErrorMessage(error) } },
            ] as TAction);
            callbacks.markReadIfCurrent(conversationId, runId);
            return { streamResult: "error" as const, usage: null as StreamUsage | null };
          } finally {
            controllerRegistry.endRun(runId, controller);
          }
        },
        initial: "",
        onValue: (text, chunk) => {
          const currentText = text + chunk;
          callbacks.dispatchToConversation(conversationId, [
            "updateAssistantText",
            { runId, text: currentText },
          ] as TAction);
          // WHY: Stream chunks must dirty the originating conversation so
          // throttled streaming checkpoints save A while the user views B.
          callbacks.touch(conversationId);
          return currentText;
        },
        finalize: ({ streamResult, usage }, currentText) => {
          // WHY: On abort the stream stops calling onChunk mid-text;
          // re-dispatch the final accumulated value so the persisted
          // assistant message reflects everything received.
          if (streamResult === "aborted") {
            callbacks.dispatchToConversation(conversationId, [
              "updateAssistantText",
              { runId, text: currentText },
            ] as TAction);
          }
          if (usage) callbacks.dispatchToConversation(conversationId, ["setUsage", { runId, usage }] as TAction);
          return streamResult;
        },
      },
      conversationId,
      runId,
      request,
      handleStreamResult,
      pendingRunRefs.onComplete,
    );

  const runGenerateRun = (runId: string, request: CardGenerationStreamRequest): Promise<void> =>
    runStream<CardGenerationStreamRequest, GeneratedCard, StreamResult, null>(
      {
        mode: "cards",
        transport: async (req, onValue) => {
          const controller = controllerRegistry.beginRun(runId);
          try {
            await transports.getStreamGenerator()(
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
            callbacks.dispatchToConversation(conversationId, [
              "runFailed",
              { runId, error: { message: displayErrorMessage(error) } },
            ] as TAction);
            callbacks.markReadIfCurrent(conversationId, runId);
            return "error" as const;
          } finally {
            controllerRegistry.endRun(runId, controller);
          }
        },
        initial: null,
        onValue: (_acc, card) => {
          callbacks.dispatchToConversation(conversationId, ["addCard", { runId, card }] as TAction);
          // WHY: Card arrivals (and their idle cardStatuses) must dirty the
          // originating conversation, not whatever is currently viewed.
          callbacks.touch(conversationId);
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

  const executeChatRun = (runId: string, request: ChatStreamRequest): Promise<void> =>
    queue.enqueue(() => runChatRun(runId, request));

  const executeGenerateRun = (runId: string, request: CardGenerationStreamRequest): Promise<void> =>
    queue.enqueue(() => runGenerateRun(runId, request));

  const retryRun = async (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ): Promise<void> =>
    queue.enqueue(async () => {
      const run = callbacks.readState().runs[runId];
      const effectiveMode: AIChatMode = run?.mode ?? mode;

      callbacks.dispatch(["restartRun", { runId, templateFields, mode: effectiveMode, modelName }] as TAction);

      if (effectiveMode === "chat") {
        callbacks.dispatch(["updateAssistantText", { runId, text: "" }] as TAction);
        await runChatRun(runId, request as ChatStreamRequest);
      } else {
        await runGenerateRun(runId, request as CardGenerationStreamRequest);
      }
    });

  return {
    conversationId,
    armPendingRun: pendingRunRefs.arm,
    executeChatRun,
    executeGenerateRun,
    retryRun,
  };
}
