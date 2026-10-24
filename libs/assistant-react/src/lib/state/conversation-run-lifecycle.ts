import type { StreamUsage } from "@koloda/ai";
import { logAssistantStructured } from "@koloda/assistant";
import type { AssistantRunError } from "@koloda/assistant";
import type {
  ConversationReducerState,
  InterruptedReason,
  RunIdPayload,
  RunLifecycleEvent,
  RunTerminationReason,
} from "./conversation-types";
import { clearActiveIfRun, finishRunningReasoning, finishRunningTools, stampElapsed } from "./conversation-run-helpers";

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
    run.templateFields = null;
    run.startedAt = new Date();
    run.elapsedSeconds = null;
    run.modelName = event.modelName !== undefined ? event.modelName : run.modelName;
    run.usage = undefined;
    run.error = undefined;
    run.stopNote = undefined;
    draft.activeRunId = runId;
    // WHY: retry reuses the run id; a later fail must count as a new failure,
    // and a later finish away from the conversation as unread.
    if (draft.dismissedRunErrorId === runId) draft.dismissedRunErrorId = null;
    if (draft.lastReadRunId === runId) draft.lastReadRunId = null;
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
  // WHY: the step-budget chunk arrives before the run ends; an end other than
  // success keeps no note, which restore would reject as corrupt.
  if (run.status !== "success") run.stopNote = undefined;
  finishRunningReasoning(run);
  // WHY: a call the user canceled did not fail — an add_deck write may even have
  // landed. Failure and interruption keep error (ASSISTANT-DATA-ACCESS.md §Visibility).
  finishRunningTools(run, terminationReason === "user" ? "canceled" : "error");
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
  modelName?: string;
};

// INVARIANT: A restart of a missing or non-retryable run is a no-op
// (hasRetryableTurn parity), so a stray restart can neither wipe a successful
// run nor conjure one from nothing.
export function restartRun(draft: ConversationReducerState, payload: RestartRunPayload) {
  transitionRun(draft, payload.runId, { type: "restart", modelName: payload.modelName });
}

export function markStepBudgetReached(draft: ConversationReducerState, payload: RunIdPayload) {
  const run = draft.runs[payload.runId];
  if (run?.status === "streaming") run.stopNote = "step_budget";
}

type SetUsagePayload = { runId: string; usage: StreamUsage };

export function setUsage(draft: ConversationReducerState, payload: SetUsagePayload) {
  const run = draft.runs[payload.runId];
  if (run) run.usage = payload.usage;
}
