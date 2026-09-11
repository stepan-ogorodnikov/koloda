import type { TemplateFields } from "@koloda/srs";
import type { DataAccessSnapshot } from "../runs/data-access";
import type { TextUIPart } from "ai";
import type { ConversationReducerState } from "./conversation-types";
import { isReasoningActivity } from "./conversation-types";
import {
  activityTiming,
  clearActiveIfRun,
  dropRuns,
  ensureActivity,
  finishRunningReasoning,
  makeRun,
} from "./conversation-run-helpers";
import { assistantMessageId, createTextMessage, userMessageId } from "./assistant-messages";

type AddUserMessagePayload = { runId: string; text: string };

function addUserMessage(draft: ConversationReducerState, payload: AddUserMessagePayload) {
  draft.messages.push(
    createTextMessage(userMessageId(payload.runId), "user", payload.text, {
      createdAt: new Date().toISOString(),
      runId: payload.runId,
    }),
  );
}

type AddAssistantMessagePayload = { runId: string; kind: "chat-text"; text: string };

function addAssistantMessage(draft: ConversationReducerState, payload: AddAssistantMessagePayload) {
  draft.messages.push(
    createTextMessage(assistantMessageId(payload.runId), "assistant", payload.text, {
      kind: payload.kind,
      runId: payload.runId,
    }),
  );
}

type UpdateAssistantTextPayload = { runId: string; text: string };

// WHY: replace the existing text part in place (never the whole parts array)
// so other parts appended alongside survive text updates.
export function updateAssistantText(draft: ConversationReducerState, payload: UpdateAssistantTextPayload) {
  const msg = draft.messages.find((m) => m.id === assistantMessageId(payload.runId));
  if (!msg) return;
  const textPart = msg.parts.find((part): part is TextUIPart => part.type === "text");
  if (textPart) {
    textPart.text = payload.text;
  } else {
    msg.parts.push({ type: "text" as const, text: payload.text });
  }
  // WHY: the answer starting is the same signal as a tool call — close the
  // open thinking row so the activity widget can auto-collapse it.
  if (payload.text !== "") {
    const run = draft.runs[payload.runId];
    if (run) finishRunningReasoning(run);
  }
}

type AppendAssistantReasoningPayload = { runId: string; text: string };

// WHY: reasoning lives on the run activity list (not message parts) so it
// can sit in arrival order with tool calls. Consecutive deltas merge into
// the trailing thinking row; a new row starts after a tool.
export function appendAssistantReasoning(draft: ConversationReducerState, payload: AppendAssistantReasoningPayload) {
  const run = draft.runs[payload.runId];
  if (!run || payload.text === "") return;
  const activity = ensureActivity(run);
  const last = activity.at(-1);
  if (last && isReasoningActivity(last)) {
    last.text += payload.text;
    last.status = "running";
    // WHY: clearing unfreezes the live timer when the row goes back to running.
    // A leftover stamp freezes ActivityElapsed after more thinking reopens a
    // row that answer text had already closed.
    last.elapsedSeconds = null;
    return;
  }
  const reasoningCount = activity.filter(isReasoningActivity).length;
  activity.push({
    kind: "reasoning",
    id: `${payload.runId}-reasoning-${reasoningCount}`,
    text: payload.text,
    status: "running",
    ...activityTiming(),
  });
}

type StartRunPayload = {
  runId: string;
  templateFields?: TemplateFields | null;
  modelName?: string;
  dataAccess?: DataAccessSnapshot;
};

function startRun(draft: ConversationReducerState, payload: StartRunPayload) {
  draft.activeRunId = payload.runId;
  draft.runs[payload.runId] = makeRun(payload.runId, payload.templateFields, payload.modelName, payload.dataAccess);
}

type SubmitTurnPayload = {
  runId: string;
  text: string;
  kind: "chat-text";
  assistantText: string;
  templateFields?: TemplateFields | null;
  modelName?: string;
  dataAccess?: DataAccessSnapshot;
};

// WHY: One dispatch creates user turn + run + assistant placeholder so
// subscribers never observe the intermediate "user message without a run"
// or "run without an assistant slot" states of three separate actions.
export function submitTurn(draft: ConversationReducerState, payload: SubmitTurnPayload) {
  addUserMessage(draft, { runId: payload.runId, text: payload.text });
  startRun(draft, {
    runId: payload.runId,
    templateFields: payload.templateFields,
    modelName: payload.modelName,
    dataAccess: payload.dataAccess,
  });
  addAssistantMessage(draft, {
    runId: payload.runId,
    kind: payload.kind,
    text: payload.assistantText,
  });
  draft.promptInput = "";
}

type RollbackSubmitTurnPayload = { runId: string };

// WHY: Safety net if the engine accepted then the returned promise rejects
// while the turn is still streaming — a late rejection must not delete a
// terminal success/failed/canceled/interrupted turn.
export function rollbackSubmitTurn(draft: ConversationReducerState, payload: RollbackSubmitTurnPayload) {
  const run = draft.runs[payload.runId];
  if (!run || run.status !== "streaming") return;
  const dropped = dropRuns(draft, new Set([payload.runId]));
  draft.messages = dropped.messages;
  draft.runs = dropped.runs;
  clearActiveIfRun(draft, payload.runId);
  if (draft.lastReadRunId === payload.runId) draft.lastReadRunId = null;
  if (draft.dismissedRunErrorId === payload.runId) draft.dismissedRunErrorId = null;
}
