import type { AssistantToolEvent, ChatStreamChunk, ChatStreamRequest, StreamUsage } from "@koloda/ai";
import { isAbortError, isAppError, toAIAppError } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import { AssistantDuplicateRunError, AssistantEngineClosedError } from "./assistant-engine";
import type { AssistantExecutionIdentity, AssistantExecutionPort } from "./assistant-execution-port";
import type { AssistantEvent, AssistantRunError } from "./assistant-protocol";
import { boundRunErrorDetails } from "./assistant-protocol";
import type { RunAbortReason, RunControllerRegistry } from "./run-controller-registry";
import { RunControllerRegistryClosedError } from "./run-controller-registry";
import { runStream } from "./run-stream";
import { createSerialQueue, QueueClosedError } from "./serial-queue";
import type { QueueCancelReason } from "./serial-queue";
import type { StreamResult } from "./stream-result";

export type ConversationRuntimeCallbacks = {
  /** Engine emits typed events; adapters translate them into store actions. */
  emit: (event: AssistantEvent) => void;
  markReadIfCurrent: (id: string, runId: string) => void;
  touch: (conversationId: string) => void;
  /** True while the run can still accept a terminal cancel/complete transition. */
  isRunStreaming: (conversationId: string, runId: string) => boolean;
  // WHY: disposeConversation cancels known run ids from this snapshot so
  // in-flight AbortControllers abort before the runtime is dropped.
  readConversationState: (conversationId: string) => { runs: Record<string, unknown> };
};

export type ConversationRuntimeTransports = {
  /** Application-scoped provider boundary for identity-bearing commands. */
  executionPort: AssistantExecutionPort;
};

/**
 * Lifecycle phase of a run inside this runtime: queued (serial-queue entry),
 * awaitingStart (dequeued, before beginRun), inFlight (provider transport).
 * `requestedReason` is a cancel stamped before the transport can observe it;
 * `abortReason` is the registry cause stashed by the AbortError path for
 * `handleStreamResult` to consume.
 */
type RunLifecycle = {
  phase: "queued" | "awaitingStart" | "inFlight";
  requestedReason?: QueueCancelReason;
  abortReason?: RunAbortReason;
};

export type ConversationRuntime = {
  conversationId: string;
  executeChatRun: (runId: string, request: ChatStreamRequest, execution: AssistantExecutionIdentity) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest,
    templateFields: TemplateFields | null,
    modelName: string | undefined,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  cancel: (runId: string, reason?: QueueCancelReason) => void;
  close: (reason: QueueCancelReason) => void;
};

export function createConversationRuntime(
  conversationId: string,
  callbacks: ConversationRuntimeCallbacks,
  transports: ConversationRuntimeTransports,
  controllerRegistry: Pick<RunControllerRegistry, "beginRun" | "endRun" | "cancel" | "has" | "takeAbortReason">,
): ConversationRuntime {
  const queue = createSerialQueue<void>();

  /**
   * Single per-run lifecycle record. Replaces the four previously separate
   * race-tracking slots (cancelBeforeStart, runAwaitingStart, abortedRunReasons,
   * outstandingRunId) so every invariant is inspectable in one place.
   *
   * INVARIANT: At most one entry per conversation " occupancy is claimed
   * synchronously on enqueue (duplicate submit/retry rejects before a second
   * serial-queue entry is created) and released when the task settles.
   */
  const runs = new Map<string, RunLifecycle>();

  /** WHY: Cancel can win the race after a task dequeues but before beginRun;
   * a stamped requestedReason blocks provider execution without a controller. */
  const takeRequestedReason = (runId: string): QueueCancelReason | undefined => {
    const entry = runs.get(runId);
    if (entry === undefined || entry.requestedReason === undefined) return undefined;
    const reason = entry.requestedReason;
    delete entry.requestedReason;
    return reason;
  };

  const emit = (event: AssistantEvent) => {
    callbacks.emit(event);
  };

  const applyQueuedCancel = (runId: string, reason: QueueCancelReason) => {
    if (!callbacks.isRunStreaming(conversationId, runId)) return;
    if (reason === "app_shutdown" || reason === "dispose") {
      // WHY: dispose has no dedicated termination reason; treat as non-user
      // interruption so AbortError/queue cancel cannot look like user cancel.
      emit({
        type: "runTerminated",
        conversationId,
        runId,
        outcome: { status: "interrupted", reason: "app_shutdown" },
      });
      callbacks.touch(conversationId);
      return;
    }
    emit({
      type: "runTerminated",
      conversationId,
      runId,
      outcome: { status: "canceled", reason: "user" },
    });
    callbacks.markReadIfCurrent(conversationId, runId);
    callbacks.touch(conversationId);
  };

  const takeCancelBeforeStart = takeRequestedReason;

  const classifyAbortError = (runId: string): StreamResult => {
    const reason = controllerRegistry.takeAbortReason(runId);
    if (reason === undefined) {
      // WHY: Exception type is not evidence of user intent — providers and
      // transports can abort internally without a requested termination cause.
      emit({
        type: "runTerminated",
        conversationId,
        runId,
        outcome: { status: "failed", error: { message: "ai.aborted" } },
      });
      callbacks.markReadIfCurrent(conversationId, runId);
      return "error";
    }
    // WHY: stash on the lifecycle record " the registry stamp is consumed
    // here, but handleStreamResult reads it after endRun/finally.
    const entry = runs.get(runId);
    if (entry) entry.abortReason = reason;
    return "aborted";
  };

  // WHY: beginRun sits outside the provider try/catch. A closed registry must
  // settle through the same abort→interrupt path as dispose AbortError, not
  // reject past transport handling and leave the run `streaming`.
  const beginRunForTransport = (runId: string): AbortController | null => {
    try {
      return controllerRegistry.beginRun(runId);
    } catch (error) {
      if (error instanceof RunControllerRegistryClosedError) {
        const entry = runs.get(runId);
        if (entry) entry.abortReason = error.reason;
        return null;
      }
      throw error;
    }
  };

  const handleStreamResult = (targetConversationId: string, result: StreamResult, runId: string) => {
    switch (result) {
      case "success":
        emit({
          type: "runTerminated",
          conversationId: targetConversationId,
          runId,
          outcome: { status: "success" },
        });
        callbacks.markReadIfCurrent(targetConversationId, runId);
        // WHY: Force a save with the post-completion state so a
        // throttled streaming checkpoint cannot outlive the terminal
        // success status on disk. Touch by originating id — viewing B
        // must not dirty B when A's background run finishes.
        callbacks.touch(targetConversationId);
        break;
      case "error":
        // WHY: `runFailed` was already emitted in the transport catch;
        // still dirty the originating conversation so the failed terminal
        // status is scheduled for save.
        callbacks.touch(targetConversationId);
        break;
      case "aborted": {
        const entry = runs.get(runId);
        const reason = entry?.abortReason ?? entry?.requestedReason ?? "user";
        if (entry) {
          entry.abortReason = undefined;
          entry.requestedReason = undefined;
        }
        // WHY: Capture streaming-ness before the terminal dispatch. Graceful
        // shutdown interrupts before aborting; a blind touch would schedule a
        // redundant second durable write of the same interrupted snapshot.
        const shouldPersist = callbacks.isRunStreaming(targetConversationId, runId);

        if (reason === "app_shutdown" || reason === "dispose") {
          if (!shouldPersist) break;
          // WHY: dispose has no dedicated termination reason; treat as non-user
          // interruption so AbortError cannot look like user cancel.
          emit({
            type: "runTerminated",
            conversationId: targetConversationId,
            runId,
            outcome: { status: "interrupted", reason: "app_shutdown" },
          });
          callbacks.touch(targetConversationId);
          break;
        }

        // WHY: Always emit cancel on requested user abort — the reducer
        // no-ops if already terminal; skipping when !streaming hid cancel from
        // callers that observe the action stream (and matched prior AbortError
        // classification).
        emit({
          type: "runTerminated",
          conversationId: targetConversationId,
          runId,
          outcome: { status: "canceled", reason: "user" },
        });
        callbacks.markReadIfCurrent(targetConversationId, runId);
        if (shouldPersist) {
          callbacks.touch(targetConversationId);
        }
        break;
      }
    }
  };

  const runChatRun = async (
    runId: string,
    request: ChatStreamRequest,
    execution: AssistantExecutionIdentity,
  ): Promise<void> => {
    const earlyCancel = takeCancelBeforeStart(runId);
    if (earlyCancel !== undefined) {
      applyQueuedCancel(runId, earlyCancel);
      return;
    }

    return runStream(
      {
        transport: async (req, onValue) => {
          // WHY: Last-chance gate for cancel that landed after dequeue.
          const gateReason = takeCancelBeforeStart(runId);
          if (gateReason !== undefined) {
            {
              const gateEntry = runs.get(runId);
              if (gateEntry) gateEntry.abortReason = gateReason;
            }
            return { streamResult: "aborted" as const, usage: null as StreamUsage | null };
          }
          // INVARIANT: Leaving the awaiting-start gap before beginRun so a
          // post-abort cancel cannot re-stamp a requestedReason.
          const gateEntry = runs.get(runId);
          if (gateEntry && gateEntry.phase === "awaitingStart") gateEntry.phase = "inFlight";
          const controller = beginRunForTransport(runId);
          if (!controller) {
            return { streamResult: "aborted" as const, usage: null as StreamUsage | null };
          }
          try {
            const onChunk = (chunk: ChatStreamChunk) => {
              if (!controller.signal.aborted) onValue(chunk);
            };
            // WHY: same abort gate as text — a cancel mid-tool must not record
            // partial tool traffic on the run.
            const onToolEvent = (event: AssistantToolEvent) => {
              if (!controller.signal.aborted) onValue(event);
            };
            const usage = await transports.executionPort.executeChat(
              {
                kind: "chat",
                conversationId,
                runId,
                identity: execution,
                request: req,
              },
              onChunk,
              onToolEvent,
              controller.signal,
            );
            return { streamResult: "success" as const, usage: usage ?? null };
          } catch (e) {
            // WHY: AbortError alone is not user cancel — classify from
            // requested termination cause. A real Error must surface even if
            // the signal was also aborted.
            if (isAbortError(e)) {
              return {
                streamResult: classifyAbortError(runId),
                usage: null as StreamUsage | null,
              };
            }
            const error = e instanceof Error ? e : new Error(String(e));
            emit({
              type: "runTerminated",
              conversationId,
              runId,
              outcome: { status: "failed", error: toRunError(error) },
            });
            callbacks.markReadIfCurrent(conversationId, runId);
            return { streamResult: "error" as const, usage: null as StreamUsage | null };
          } finally {
            controllerRegistry.endRun(runId, controller);
          }
        },
        initial: "",
        onValue: (text: string, chunk: ChatStreamChunk | AssistantToolEvent) => {
          // WHY: reasoning records on the run activity list (alongside tools)
          // and never enters the accumulated text that becomes follow-up
          // request history (card-outputs precedent).
          if (chunk.kind === "reasoning") {
            emit({
              type: "runChunk",
              conversationId,
              runId,
              chunk: { kind: "reasoning", text: chunk.text },
            });
            // WHY: reasoning arrivals dirty the conversation like text so
            // streaming checkpoints persist the partial thinking row.
            callbacks.touch(conversationId);
            return text;
          }
          if (chunk.kind !== "text") {
            emit({
              type: "runChunk",
              conversationId,
              runId,
              chunk,
            });
            // WHY: tool arrivals must dirty the originating conversation, like
            // card arrivals, so streaming checkpoints save A while viewing B.
            callbacks.touch(conversationId);
            return text;
          }
          const currentText = text + chunk.text;
          emit({
            type: "runChunk",
            conversationId,
            runId,
            chunk: { kind: "assistantText", text: currentText },
          });
          // WHY: Stream chunks must dirty the originating conversation so
          // throttled streaming checkpoints save A while the user views B.
          callbacks.touch(conversationId);
          return currentText;
        },
        finalize: ({ streamResult, usage }, currentText) => {
          // WHY: On abort the stream stops calling onChunk mid-text;
          // re-emit the final accumulated value so the persisted
          // assistant message reflects everything received.
          if (streamResult === "aborted") {
            emit({
              type: "runChunk",
              conversationId,
              runId,
              chunk: { kind: "assistantText", text: currentText },
            });
          }
          if (usage) {
            emit({
              type: "runChunk",
              conversationId,
              runId,
              chunk: { kind: "usage", usage },
            });
          }
          return streamResult;
        },
      },
      conversationId,
      runId,
      request,
      handleStreamResult,
    );
  };

  const mapQueueClosed = (error: QueueClosedError): AssistantEngineClosedError =>
    new AssistantEngineClosedError(
      error.reason === "app_shutdown" || error.reason === "dispose" ? "closing" : "closed",
    );

  const guardClosed = async (run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      // WHY: Callers already handle AssistantEngineClosedError; do not resolve
      // closed-queue races as success.
      if (error instanceof QueueClosedError) throw mapQueueClosed(error);
      // WHY: Safety net if a closed-registry throw escapes transport conversion —
      // still a typed engine-closed rejection, never a bare Error.
      if (error instanceof RunControllerRegistryClosedError) {
        throw new AssistantEngineClosedError(
          error.reason === "app_shutdown" || error.reason === "dispose" ? "closing" : "closed",
        );
      }
      throw error;
    }
  };

  const withAwaitingStart = async (runId: string, run: () => Promise<void>): Promise<void> => {
    const entry = runs.get(runId);
    if (entry) entry.phase = "awaitingStart";
    try {
      await run();
    } finally {
      // WHY: only clear the awaitingStart marker here; occupancy (the entry
      // itself) is released by the enqueue finally.
      if (entry && entry.phase === "awaitingStart") entry.phase = "inFlight";
    }
  };

  // WHY: Reject (do not supersede) a second execute/retry while one is already
  // active or queued — duplicate provider work must not enqueue silently.
  // INVARIANT: Duplicate/closed fail synchronously so UI can apply submitTurn
  // only after the command is accepted. Do not claim occupancy unless enqueue succeeded.
  const enqueueExclusive = (runId: string, task: () => Promise<void>): Promise<void> => {
    // INVARIANT: at most one entry per conversation — its key is the
    // outstanding run; duplicate submit/retry rejects synchronously.
    const outstanding = runs.keys().next();
    if (!outstanding.done) throw new AssistantDuplicateRunError(conversationId, runId, outstanding.value);
    let pending: Promise<void>;
    try {
      pending = queue.enqueue(runId, task);
    } catch (error) {
      if (error instanceof QueueClosedError) throw mapQueueClosed(error);
      throw error;
    }
    runs.set(runId, { phase: "queued" });
    return guardClosed(() => pending).finally(() => {
      runs.delete(runId);
    });
  };

  const executeChatRun = (
    runId: string,
    request: ChatStreamRequest,
    execution: AssistantExecutionIdentity,
  ): Promise<void> =>
    enqueueExclusive(runId, async () => {
      await withAwaitingStart(runId, () => runChatRun(runId, request, execution));
    });

  const retryRun = (
    runId: string,
    request: ChatStreamRequest,
    templateFields: TemplateFields | null,
    modelName: string | undefined,
    execution: AssistantExecutionIdentity,
  ): Promise<void> =>
    enqueueExclusive(runId, async () => {
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
        // WHY: Retry is always chat+tools.
        emit({
          type: "runStarted",
          conversationId,
          run: {
            runId,
            templateFields,
            modelName,
          },
        });

        emit({
          type: "runChunk",
          conversationId,
          runId,
          chunk: { kind: "assistantText", text: "" },
        });
        await runChatRun(runId, request, execution);
      });
    });

  const cancel = (runId: string, reason: QueueCancelReason = "user") => {
    const wasQueued = queue.cancel(runId, reason);
    const entry = runs.get(runId);
    if (wasQueued) {
      // WHY: Entry will never run — apply terminal state now and do not leave
      // a requestedReason stamped (a later retry of the same runId must proceed).
      applyQueuedCancel(runId, reason);
    } else if (
      entry &&
      entry.phase === "awaitingStart" &&
      !controllerRegistry.has(runId) &&
      callbacks.isRunStreaming(conversationId, runId)
    ) {
      // WHY: Dequeued but not yet beginRun — stamp so transport skips the
      // provider, and transition immediately for UI responsiveness.
      // INVARIANT: the awaitingStart phase gates the stamp; a second cancel
      // after the in-flight controller was removed must not leave a
      // requestedReason for a later retry that reuses the same runId.
      entry.requestedReason = reason;
      applyQueuedCancel(runId, reason);
    }
    // else: in-flight or already terminal — abort if present; AbortError path
    // owns the terminal transition for live controllers using recorded provenance.
    controllerRegistry.cancel(runId, reason);
  };

  const close = (reason: QueueCancelReason) => {
    const canceledRunIds = queue.close(reason);
    for (const runId of canceledRunIds) {
      applyQueuedCancel(runId, reason);
    }
  };

  return {
    conversationId,
    executeChatRun,
    retryRun,
    cancel,
    close,
  };
}

function toRunError(error: Error): AssistantRunError {
  const appError = toAIAppError(error);
  if (!isAppError(appError)) return { message: "unknown", details: boundRunErrorDetails(error.message) };
  return appError.details
    ? { message: appError.code, details: boundRunErrorDetails(appError.details) }
    : { message: appError.code };
}
