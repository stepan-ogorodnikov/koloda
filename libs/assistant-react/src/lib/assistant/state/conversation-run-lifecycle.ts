import type { StreamUsage } from "@koloda/ai";
import { logAssistantStructured } from "@koloda/assistant";
import type { AssistantRunError } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import type {
  ConversationReducerState,
  InterruptedReason,
  RunIdPayload,
  RunLifecycleEvent,
  RunTerminationReason,
} from "./conversation-types";
import {
  clearActiveIfRun,
  finishRunningReasoning,
  makeRun,
  stampElapsed,
  stampRunningToolElapsed,
} from "./conversation-run-helpers";
import { assistantMessageId, getAssistantMetadata } from "./assistant-messages";

// INVARIANT: Legal run lifecycle transitions:
// streaming → success | failed | canceled(reason:user) | interrupted(reason);
// restart (from failed | canceled | interrupted) → streaming.
export function transitionRun(draft: ConversationReducerState, runId: string, event: RunLifecycleEvent): boolean {
  const run = draft.runs[runId];
  if (!run) return false;

  const priorStatus = run.status;

  if (event.type === "restart") {
    // WHY: Only failed/canceled/interrupted runs are retryable
    // (ASSISTANT-CONVERSATIONS.md §Retry). A restart of a success/streaming
    // run is a no-op so a stray command can never wipe a good answer.
    if (run.status !== "failed" && run.status !== "canceled" && run.status !== "interrupted") return false;
    run.status = "streaming";
    run.reason = undefined;
    run.cards = [];
    run.cardStatuses = {};
    run.toolCalls = [];
    run.writeTargetDeckId = undefined;
    run.writeTargetTemplateId = undefined;
    run.templateFields = event.templateFields;
    run.startedAt = new Date();
    run.elapsedSeconds = null;
    run.modelName = event.modelName !== undefined ? event.modelName : run.modelName;
    // WHY: restart leaves the stored dataAccess snapshot untouched - retry
    // reuses the runId, so the recorded snapshot stays authoritative.
    run.usage = undefined;
    run.error = undefined;
    draft.activeRunId = runId;
    // WHY: retry reuses the run id; a later fail must count as a new failure.
    if (draft.dismissedRunErrorId === runId) draft.dismissedRunErrorId = null;
    logAssistantStructured({
      conversationId: draft.id,
      runId,
      commandOrEvent: "restart",
      priorStatus,
      nextStatus: "streaming",
    });
    return true;
  }

  // INVARIANT: terminal events only from streaming — rejects double-complete /
  // fail-after-cancel and similar illegal transitions.
  if (run.status !== "streaming") return false;

  let terminationReason: RunTerminationReason | undefined;
  if (event.type === "complete") {
    run.status = "success";
    run.reason = undefined;
    run.error = undefined;
  } else if (event.type === "fail") {
    run.status = "failed";
    run.reason = undefined;
    run.error = event.error;
  } else if (event.type === "interrupt") {
    run.status = "interrupted";
    run.reason = event.reason;
    terminationReason = event.reason;
  } else {
    run.status = "canceled";
    run.reason = "user";
    terminationReason = "user";
  }
  finishRunningReasoning(run);
  stampRunningToolElapsed(run);
  stampElapsed(run);
  clearActiveIfRun(draft, runId);
  logAssistantStructured({
    conversationId: draft.id,
    runId,
    commandOrEvent: event.type,
    priorStatus,
    nextStatus: run.status,
    terminationReason,
  });
  return true;
}

export function completeRun(draft: ConversationReducerState, payload: RunIdPayload) {
  transitionRun(draft, payload.runId, { type: "complete" });
}

type RunFailedPayload = { runId: string; error: AssistantRunError };

export function runFailed(draft: ConversationReducerState, payload: RunFailedPayload) {
  transitionRun(draft, payload.runId, { type: "fail", error: payload.error });
}

export function cancelRun(draft: ConversationReducerState, payload: RunIdPayload) {
  transitionRun(draft, payload.runId, { type: "cancel" });
}

type InterruptRunPayload = { runId: string; reason: InterruptedReason };

export function interruptRun(draft: ConversationReducerState, payload: InterruptRunPayload) {
  transitionRun(draft, payload.runId, { type: "interrupt", reason: payload.reason });
}

type RestartRunPayload = {
  runId: string;
  templateFields: TemplateFields | null;
  modelName?: string;
};

function applyRetryAssistantKind(draft: ConversationReducerState, runId: string) {
  const msg = draft.messages.find((m) => m.id === assistantMessageId(runId));
  if (!msg) return;
  const metadata = getAssistantMetadata(msg);
  if (!metadata || metadata.kind === "chat-text") return;
  if (metadata.kind === "error") {
    msg.metadata = { kind: "chat-text", runId };
  }
}

export function restartRun(draft: ConversationReducerState, payload: RestartRunPayload) {
  if (
    transitionRun(draft, payload.runId, {
      type: "restart",
      templateFields: payload.templateFields,
      modelName: payload.modelName,
    })
  ) {
    applyRetryAssistantKind(draft, payload.runId);
    return;
  }

  // WHY: Retry after restore may find the run dropped (normalize removes
  // orphaned failed markers) while the assistant error message
  // remains — recreate the run and rewrite the error marker. Anything else
  // (a present but non-retryable run, or a missing run with no marker) is a
  // no-op: hasRetryableTurn parity, so a stray restart can neither wipe a
  // successful run nor conjure one from nothing.
  if (draft.runs[payload.runId]) return;
  const assistantMessage = draft.messages.find((m) => m.id === assistantMessageId(payload.runId));
  const markerKind = assistantMessage ? getAssistantMetadata(assistantMessage)?.kind : undefined;
  if (markerKind !== "error" && markerKind !== "chat-text") return;
  draft.runs[payload.runId] = makeRun(payload.runId, payload.templateFields, payload.modelName);
  applyRetryAssistantKind(draft, payload.runId);
  draft.activeRunId = payload.runId;
  if (draft.dismissedRunErrorId === payload.runId) draft.dismissedRunErrorId = null;
}

type SetUsagePayload = { runId: string; usage: StreamUsage };

export function setUsage(draft: ConversationReducerState, payload: SetUsagePayload) {
  const run = draft.runs[payload.runId];
  if (run) run.usage = payload.usage;
}
