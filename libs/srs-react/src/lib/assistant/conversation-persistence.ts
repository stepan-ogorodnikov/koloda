import { produce } from "immer";
import { getAssistantMetadata, getRunIdFromMessageId } from "./assistant-messages";
import { dropRuns } from "./conversation-reducer";
import type { CardStatus, ConversationReducerState, GenerationRun } from "./conversation-reducer";

export function normalizeRestoredConversation(state: ConversationReducerState): ConversationReducerState | null {
  let normalizedAny = false;
  const runs: Record<string, GenerationRun> = {};
  const droppedRunIds = new Set<string>();
  const failedRunIds = new Set<string>();

  for (const [runId, run] of Object.entries(state.runs)) {
    if (run.status === "streaming") {
      droppedRunIds.add(runId);
      normalizedAny = true;
      continue;
    }

    if (run.status === "failed") {
      failedRunIds.add(runId);
      normalizedAny = true;
      continue;
    }

    let nextRun: GenerationRun = run;
    let runChanged = false;

    let statusesChanged = false;
    const resetStatuses: Record<number, CardStatus> = {};
    for (const [index, status] of Object.entries(run.cardStatuses)) {
      if (status === "pending") {
        resetStatuses[Number(index)] = "idle";
        statusesChanged = true;
      } else {
        resetStatuses[Number(index)] = status;
      }
    }
    if (statusesChanged) {
      nextRun = { ...nextRun, cardStatuses: resetStatuses };
      runChanged = true;
    }

    if (runChanged) {
      runs[runId] = nextRun;
      normalizedAny = true;
    } else {
      runs[runId] = run;
    }
  }

  if (
    !normalizedAny &&
    state.activeRunId === null &&
    state.dismissedRunErrorId === null &&
    failedRunIds.size === 0 &&
    (state.lastReadRunId === null || runs[state.lastReadRunId] !== undefined)
  ) {
    return null;
  }

  const filtered = dropRuns(state, droppedRunIds);
  const messages = filtered.messages.map((m) => {
    if (m.role !== "assistant") return m;
    const runId = getRunIdFromMessageId(m.id);
    if (!runId || !failedRunIds.has(runId)) return m;
    const run = state.runs[runId];
    if (!run) return m;
    const metadata = getAssistantMetadata(m);
    if (!metadata) return m;

    return {
      ...m,
      metadata: { kind: "error" as const, runId: metadata.runId, mode: run.mode },
      parts: [{ type: "text" as const, text: "" }],
    };
  });

  return {
    ...state,
    activeRunId: null,
    dismissedRunErrorId: null,
    // WHY: If the run the user last read is about to be dropped, the
    // pointer is stale. Clear it so the unread predicate correctly
    // evaluates against the new latest run on next read.
    lastReadRunId: state.lastReadRunId !== null && runs[state.lastReadRunId] === undefined ? null : state.lastReadRunId,
    runs,
    messages,
  };
}

/**
 * Cancels all streaming runs. Used by persistence cleanup, not by user-facing dispatch.
 */
export function cancelStreamingRuns(state: ConversationReducerState): ConversationReducerState {
  let changed = false;
  const next = produce(state, (draft) => {
    for (const run of Object.values(draft.runs)) {
      if (run.status === "streaming") {
        run.status = "canceled";
        run.elapsedSeconds = Math.floor((Date.now() - run.startedAt.getTime()) / 1000);
        changed = true;
      }
    }
    if (changed) draft.activeRunId = null;
  });
  return changed ? next : state;
}
