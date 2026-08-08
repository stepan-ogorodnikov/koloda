import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import { isAbortError } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import { AssistantEngineClosedError } from "./assistant-engine";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "./card-generation";
import { displayErrorMessage } from "./display-error";
import type { RunControllerRegistry } from "./run-controller-registry";
import { runStream } from "./run-stream";
import { createSerialQueue, QueueClosedError } from "./serial-queue";
import type { QueueCancelReason } from "./serial-queue";
import type { StreamResult } from "./stream-result";

export type ConversationRuntimeCallbacks<TAction> = {
  dispatchToConversation: (id: string, action: TAction) => void;
  markReadIfCurrent: (id: string, runId: string) => void;
  touch: (conversationId: string) => void;
  /** True while the run can still accept a terminal cancel/complete transition. */
  isRunStreaming: (conversationId: string, runId: string) => boolean;
  // WHY: Retry must read the originating conversation's runs, not UI-current
  // state — a queued retry for A must still see A's mode after the user
  // switches to B.
  readConversationState: (conversationId: string) => { runs: Record<string, { mode?: AIChatMode }> };
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
  cancel: (runId: string, reason?: QueueCancelReason) => void;
  close: (reason: QueueCancelReason) => void;
};

export function createConversationRuntime<TAction>(
  conversationId: string,
  callbacks: ConversationRuntimeCallbacks<TAction>,
  transports: ConversationRuntimeTransports,
  controllerRegistry: Pick<RunControllerRegistry, "beginRun" | "endRun" | "cancel" | "has">,
  pendingRunRefs: {
    arm: (mode: AIChatMode, runId: string) => void;
    onComplete: (mode: AIChatMode, runId: string) => void;
  },
): ConversationRuntime<TAction> {
  const queue = createSerialQueue<void>();
  // WHY: Cancel can win the race after a task dequeues but before beginRun;
  // tracking provenance here blocks provider execution without a controller.
  const cancelBeforeStart = new Map<string, QueueCancelReason>();
  // WHY: Distinguishes dequeued-not-yet-beginRun from post-abort (controller
  // already removed) so a second cancel cannot stamp cancelBeforeStart.
  let runAwaitingStart: string | null = null;

  const applyQueuedCancel = (runId: string, reason: QueueCancelReason) => {
    if (!callbacks.isRunStreaming(conversationId, runId)) return;
    if (reason === "app_shutdown") {
      callbacks.dispatchToConversation(conversationId, ["interruptRun", { runId, reason: "app_shutdown" }] as TAction);
      callbacks.touch(conversationId);
      return;
    }
    // WHY: user + dispose use cancelRun until abort-provenance classification (#4)
    // distinguishes dispose/shutdown from explicit user cancel on AbortError paths.
    callbacks.dispatchToConversation(conversationId, ["cancelRun", { runId }] as TAction);
    callbacks.markReadIfCurrent(conversationId, runId);
    callbacks.touch(conversationId);
  };

  const takeCancelBeforeStart = (runId: string): QueueCancelReason | undefined => {
    const reason = cancelBeforeStart.get(runId);
    if (reason === undefined) return undefined;
    cancelBeforeStart.delete(runId);
    return reason;
  };

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
      case "aborted": {
        // WHY: Capture streaming-ness before cancelRun. Graceful shutdown
        // interrupts to `interrupted`/`app_shutdown` before aborting; cancel
        // is then a no-op and a blind touch would schedule a redundant second
        // durable write of the same interrupted snapshot.
        const shouldPersistCancel = callbacks.isRunStreaming(targetConversationId, runId);
        callbacks.dispatchToConversation(targetConversationId, ["cancelRun", { runId }] as TAction);
        callbacks.markReadIfCurrent(targetConversationId, runId);
        if (shouldPersistCancel) {
          // WHY: Same rationale as success — schedule a save with the real
          // cancelRun terminal state (`canceled`/`user`) rather than leaving
          // only the last streaming checkpoint on disk.
          callbacks.touch(targetConversationId);
        }
        break;
      }
    }
  };

  const runChatRun = async (runId: string, request: ChatStreamRequest): Promise<void> => {
    const earlyCancel = takeCancelBeforeStart(runId);
    if (earlyCancel !== undefined) {
      applyQueuedCancel(runId, earlyCancel);
      pendingRunRefs.onComplete("chat", runId);
      return;
    }

    return runStream(
      {
        mode: "chat",
        transport: async (req, onValue) => {
          // WHY: Last-chance gate for cancel that landed after dequeue.
          if (takeCancelBeforeStart(runId) !== undefined) {
            return { streamResult: "aborted" as const, usage: null as StreamUsage | null };
          }
          // INVARIANT: Leaving the awaiting-start gap before beginRun so a
          // post-abort cancel cannot re-stamp cancelBeforeStart.
          if (runAwaitingStart === runId) runAwaitingStart = null;
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
  };

  const runGenerateRun = async (runId: string, request: CardGenerationStreamRequest): Promise<void> => {
    const earlyCancel = takeCancelBeforeStart(runId);
    if (earlyCancel !== undefined) {
      applyQueuedCancel(runId, earlyCancel);
      pendingRunRefs.onComplete("cards", runId);
      return;
    }

    return runStream<CardGenerationStreamRequest, GeneratedCard, StreamResult, null>(
      {
        mode: "cards",
        transport: async (req, onValue) => {
          if (takeCancelBeforeStart(runId) !== undefined) {
            return "aborted" as const;
          }
          if (runAwaitingStart === runId) runAwaitingStart = null;
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
          // WHY: Card arrivals (and their idle card statuses) must dirty the
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
  };

  const guardClosed = async (run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof QueueClosedError) {
        // WHY: Callers already handle AssistantEngineClosedError; do not resolve
        // closed-queue races as success.
        throw new AssistantEngineClosedError(
          error.reason === "app_shutdown" || error.reason === "dispose" ? "closing" : "closed",
        );
      }
      throw error;
    }
  };

  const withAwaitingStart = async (runId: string, run: () => Promise<void>): Promise<void> => {
    runAwaitingStart = runId;
    try {
      await run();
    } finally {
      if (runAwaitingStart === runId) runAwaitingStart = null;
    }
  };

  const executeChatRun = (runId: string, request: ChatStreamRequest): Promise<void> =>
    guardClosed(() =>
      queue.enqueue(runId, async () => {
        await withAwaitingStart(runId, () => runChatRun(runId, request));
      }),
    );

  const executeGenerateRun = (runId: string, request: CardGenerationStreamRequest): Promise<void> =>
    guardClosed(() =>
      queue.enqueue(runId, async () => {
        await withAwaitingStart(runId, () => runGenerateRun(runId, request));
      }),
    );

  const retryRun = (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ): Promise<void> =>
    guardClosed(() =>
      queue.enqueue(runId, async () => {
        await withAwaitingStart(runId, async () => {
          const earlyCancel = takeCancelBeforeStart(runId);
          if (earlyCancel !== undefined) {
            // WHY: Do not restartRun after cancel/shutdown — that would revive a
            // terminal run and then call the provider.
            applyQueuedCancel(runId, earlyCancel);
            return;
          }

          // INVARIANT: Restart/clear/stream ownership stays on this runtime's
          // conversationId even if the UI-current conversation changed while
          // this retry waited in the serial queue.
          const run = callbacks.readConversationState(conversationId).runs[runId];
          const effectiveMode: AIChatMode = run?.mode ?? mode;

          callbacks.dispatchToConversation(conversationId, [
            "restartRun",
            { runId, templateFields, mode: effectiveMode, modelName },
          ] as TAction);

          if (effectiveMode === "chat") {
            callbacks.dispatchToConversation(conversationId, ["updateAssistantText", { runId, text: "" }] as TAction);
            await runChatRun(runId, request as ChatStreamRequest);
          } else {
            await runGenerateRun(runId, request as CardGenerationStreamRequest);
          }
        });
      }),
    );

  const cancel = (runId: string, reason: QueueCancelReason = "user") => {
    const wasQueued = queue.cancel(runId, reason);
    if (wasQueued) {
      // WHY: Entry will never run — apply terminal state now and do not leave
      // cancelBeforeStart stamped (a later retry of the same runId must proceed).
      applyQueuedCancel(runId, reason);
    } else if (
      runAwaitingStart === runId &&
      !controllerRegistry.has(runId) &&
      callbacks.isRunStreaming(conversationId, runId)
    ) {
      // WHY: Dequeued but not yet beginRun — stamp so transport skips the
      // provider, and transition immediately for UI responsiveness.
      // INVARIANT: runAwaitingStart gates the stamp; a second cancel after the
      // in-flight controller was removed must not leave cancelBeforeStart for
      // a later retry that reuses the same runId.
      cancelBeforeStart.set(runId, reason);
      applyQueuedCancel(runId, reason);
    }
    // else: in-flight or already terminal — abort if present; AbortError path
    // owns the terminal transition for live controllers.
    controllerRegistry.cancel(runId);
  };

  const close = (reason: QueueCancelReason) => {
    const canceledRunIds = queue.close(reason);
    for (const runId of canceledRunIds) {
      applyQueuedCancel(runId, reason);
    }
  };

  return {
    conversationId,
    armPendingRun: pendingRunRefs.arm,
    executeChatRun,
    executeGenerateRun,
    retryRun,
    cancel,
    close,
  };
}
