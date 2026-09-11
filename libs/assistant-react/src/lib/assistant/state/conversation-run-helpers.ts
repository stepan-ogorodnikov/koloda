import type { TemplateFields } from "@koloda/srs";
import type { DataAccessSnapshot } from "../runs/data-access";
import type { UIMessage } from "ai";
import type { AssistantRun, ConversationReducerState, RevertState, RunActivity } from "./conversation-types";
import { isReasoningActivity } from "./conversation-types";
import { assistantMessageId, getAssistantMetadata, getMessageRunId } from "./assistant-messages";

// WHY: With revert active, the target user message and everything after
// it must be hidden from the UI. The conversation state still holds the
// full message list; this function returns the user-visible prefix.
export function getVisibleMessages(messages: UIMessage[], revertState: RevertState | null): UIMessage[] {
  if (!revertState) return messages;
  const userMessageIndex = messages.findIndex((m) => m.id === revertState.revertedToUserMessageId);
  if (userMessageIndex === -1) return messages;

  return messages.slice(0, userMessageIndex);
}

export function makeRun(
  runId: string,
  templateFields: TemplateFields | null | undefined,
  modelName?: string,
  dataAccess?: DataAccessSnapshot,
): AssistantRun {
  return {
    id: runId,
    status: "streaming",
    cards: [],
    cardStatuses: {},
    toolCalls: [],
    templateFields: templateFields ?? null,
    startedAt: new Date(),
    elapsedSeconds: null,
    modelName,
    dataAccess,
  };
}

function elapsedSecondsSince(startedAt: Date): number {
  return Math.floor((Date.now() - startedAt.getTime()) / 1000);
}

export function activityTiming(): { startedAt: Date; elapsedSeconds: null } {
  return { startedAt: new Date(), elapsedSeconds: null };
}

export function stampActivityElapsed(entry: { startedAt?: Date; elapsedSeconds?: number | null }) {
  if (!entry.startedAt) return;
  entry.elapsedSeconds = elapsedSecondsSince(entry.startedAt);
}

export function finishRunningReasoning(run: AssistantRun) {
  const last = run.toolCalls?.at(-1);
  if (last && isReasoningActivity(last) && last.status === "running") {
    last.status = "done";
    stampActivityElapsed(last);
  }
}

export function stampRunningToolElapsed(run: AssistantRun) {
  for (const entry of run.toolCalls ?? []) {
    if (!isReasoningActivity(entry) && entry.status === "running") {
      stampActivityElapsed(entry);
    }
  }
}

export function ensureActivity(run: AssistantRun): RunActivity[] {
  if (!run.toolCalls) run.toolCalls = [];
  return run.toolCalls;
}

// WHY: `cloneConversationAtom` and restore-time normalization both need to drop run ids
// together with their user/assistant message pair. Linkage is via `runId` in message metadata.
export function dropRuns(
  state: ConversationReducerState,
  droppedRunIds: ReadonlySet<string>,
): { messages: UIMessage[]; runs: Record<string, AssistantRun> } {
  const messages = state.messages.filter((m) => {
    const runId = getMessageRunId(m);
    return !runId || !droppedRunIds.has(runId);
  });
  const runs: Record<string, AssistantRun> = {};
  for (const [runId, run] of Object.entries(state.runs)) {
    if (!droppedRunIds.has(runId)) runs[runId] = run;
  }
  return { messages, runs };
}

export function hasRetryableTurn(state: ConversationReducerState, runId: string): boolean {
  const run = state.runs[runId];
  if (run) {
    // INVARIANT: Successful and streaming runs are not retryable
    // (ASSISTANT-CONVERSATIONS.md §Retry). Renderers hide the button; this
    // is the backstop for programmatic controller.retry.
    return run.status === "failed" || run.status === "canceled" || run.status === "interrupted";
  }

  // WHY: Retry after restore may find the run dropped (normalize removes
  // orphaned failed markers) while the assistant message remains.
  const assistantMessage = state.messages.find((m) => m.id === assistantMessageId(runId));
  if (!assistantMessage) return false;
  const metadata = getAssistantMetadata(assistantMessage);
  return metadata?.kind === "error" || metadata?.kind === "chat-text";
}

export function findLatestErroredRun(state: ConversationReducerState): AssistantRun | null {
  const ids = Object.keys(state.runs);
  for (let i = ids.length - 1; i >= 0; i--) {
    const run = state.runs[ids[i]];
    if (run && run.status === "failed" && run.error && run.id !== state.dismissedRunErrorId) {
      return run;
    }
  }
  return null;
}

export function clearActiveIfRun(draft: ConversationReducerState, runId: string) {
  if (draft.activeRunId === runId) draft.activeRunId = null;
}

export function stampElapsed(run: AssistantRun) {
  run.elapsedSeconds = elapsedSecondsSince(run.startedAt);
}
