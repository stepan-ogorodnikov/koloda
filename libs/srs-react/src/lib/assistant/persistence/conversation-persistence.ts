import { produce } from "immer";
import { backfillUserMessageRunIds } from "../state/assistant-messages";
import { transitionRun } from "../state/conversation-reducer";
import type { CardStatus, ConversationReducerState, GenerationRun } from "../state/conversation-reducer";

/** Mirror `stampElapsed` without mutating the source run. */
function elapsedSecondsSince(startedAt: Date): number {
  return Math.floor((Date.now() - startedAt.getTime()) / 1000);
}

/**
 * DB-writable conversation fields.
 * No `revertState` — revert is in-memory only
 * (ASSISTANT-CHAT-CONVERSATIONS.md §Revert / §Persistence).
 */
export type PersistedConversation = Omit<ConversationReducerState, "revertState">;

export function toPersistedState(state: ConversationReducerState): PersistedConversation {
  const { revertState: _omit, ...persisted } = state;
  return persisted;
}

export function fromPersistedState(persisted: PersistedConversation): ConversationReducerState {
  return { ...persisted, revertState: null };
}

export function normalizeRestoredConversation(state: ConversationReducerState): ConversationReducerState | null {
  let normalizedAny = false;
  const runs: Record<string, GenerationRun> = {};

  // INVARIANT: Failed (and all other) runs must not be dropped on restore so
  // partial chat / cards remain and retry stays available.
  for (const [runId, run] of Object.entries(state.runs)) {
    let nextRun: GenerationRun = run;
    let runChanged = false;

    // WHY: A persisted `streaming` checkpoint means the process died mid-run
    // (crash / forced termination). Convert to terminal `interrupted` with
    // `crash_recovery` and keep partial output for retry. Graceful
    // `app_shutdown` is applied in-memory before the bounded final flush.
    if (run.status === "streaming") {
      nextRun = {
        ...run,
        status: "interrupted",
        reason: "crash_recovery",
        elapsedSeconds: elapsedSecondsSince(run.startedAt),
      };
      runChanged = true;
      normalizedAny = true;
    }

    let statusesChanged = false;
    const resetStatuses: Record<number, CardStatus> = {};
    for (const [index, status] of Object.entries(nextRun.cardStatuses)) {
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
      normalizedAny = true;
    }

    if (runChanged) {
      runs[runId] = nextRun;
    } else {
      runs[runId] = run;
    }
  }

  // WHY: Backfill so legacy user messages (runId only in `user-<id>`
  // encoding) stay linked, and re-stringify Date/`epoch-ms` createdAt values
  // that Electron wire revival may have injected, healing epoch timestamps
  // from run.startedAt.
  const startedAtByRunId: Record<string, Date> = {};
  for (const [runId, run] of Object.entries(state.runs)) {
    startedAtByRunId[runId] = run.startedAt;
  }
  const messagesWithRunIds = backfillUserMessageRunIds(state.messages, startedAtByRunId);
  if (messagesWithRunIds !== state.messages) normalizedAny = true;

  if (
    !normalizedAny &&
    state.activeRunId === null &&
    state.dismissedRunErrorId === null &&
    (state.lastReadRunId === null || runs[state.lastReadRunId] !== undefined)
  ) {
    return null;
  }

  return {
    ...state,
    activeRunId: null,
    dismissedRunErrorId: null,
    // WHY: lastReadRunId is only cleared when its run is actually gone.
    // Failed runs are kept, so a pointer at a failed run survives restore.
    lastReadRunId: state.lastReadRunId !== null && runs[state.lastReadRunId] === undefined ? null : state.lastReadRunId,
    runs,
    messages: messagesWithRunIds,
  };
}

export function cancelStreamingRuns(state: ConversationReducerState): ConversationReducerState {
  let changed = false;
  const next = produce(state, (draft) => {
    // WHY: same cast as `conversationReducer` — Immer's WritableDraft +
    // UIMessage-heavy state makes `transitionRun(draft, …)` hit TS2589.
    const live = draft as ConversationReducerState;
    for (const run of Object.values(live.runs)) {
      if (run.status !== "streaming") continue;
      if (transitionRun(live, run.id, { type: "cancel" })) {
        changed = true;
      }
    }
    // WHY: clear even if active pointed at a non-streaming id while zombies
    // streamed — the snapshot must not look "working" after cancel-for-save.
    if (changed) live.activeRunId = null;
  });
  return changed ? next : state;
}
