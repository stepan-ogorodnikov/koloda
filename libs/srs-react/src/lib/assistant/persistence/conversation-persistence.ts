import type { UIMessage } from "ai";
import { backfillUserMessageRunIds, getMessageRunId } from "../state/assistant-messages";
import type {
  AssistantRun,
  CardStatus,
  ConversationReducerState,
  RunReasoningActivity,
} from "../state/conversation-reducer";
import { isReasoningActivity } from "../state/conversation-reducer";
import { CONVERSATION_SCHEMA_VERSION } from "./conversation-schema-version";

/** Mirror `stampElapsed` without mutating the source run. */
function elapsedSecondsSince(startedAt: Date): number {
  return Math.floor((Date.now() - startedAt.getTime()) / 1000);
}

/**
 * DB-writable conversation fields.
 * No `revertState` — revert is in-memory only
 * (ASSISTANT-CONVERSATIONS.md §Revert / §Persistence).
 * `schemaVersion` is persistence-boundary only (not live reducer state).
 */
export type PersistedConversation = Omit<ConversationReducerState, "revertState"> & {
  schemaVersion: number;
};

export function toPersistedState(state: ConversationReducerState): PersistedConversation {
  const { revertState: _omit, ...persisted } = state;
  return { ...persisted, schemaVersion: CONVERSATION_SCHEMA_VERSION };
}

export function fromPersistedState(persisted: PersistedConversation): ConversationReducerState {
  const { schemaVersion: _omitVersion, ...rest } = persisted;
  return { ...rest, revertState: null };
}

export function normalizeRestoredConversation(state: ConversationReducerState): ConversationReducerState | null {
  let didNormalize = false;
  const runs: Record<string, AssistantRun> = {};

  // INVARIANT: Failed (and all other) runs must not be dropped on restore so
  // partial chat remains and retry stays available.
  for (const [runId, run] of Object.entries(state.runs)) {
    let nextRun: AssistantRun = run;
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
      didNormalize = true;
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
      didNormalize = true;
    }

    // WHY: a crash-restored run is terminal; leaving toolCalls as `running`
    // would keep the activity widget spinning after reload. Partial thinking
    // is still useful, so in-flight reasoning rows close as `done`.
    const toolCalls = nextRun.toolCalls;
    if (toolCalls?.some((entry) => entry.status === "running")) {
      nextRun = {
        ...nextRun,
        toolCalls: toolCalls.map((entry) => {
          if (entry.status !== "running") return entry;
          if (isReasoningActivity(entry)) return { ...entry, status: "done" as const };
          return { ...entry, status: "error" as const };
        }),
      };
      runChanged = true;
      didNormalize = true;
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
  if (messagesWithRunIds !== state.messages) didNormalize = true;

  const lifted = liftLegacyReasoningParts(messagesWithRunIds, runs);
  if (lifted.hasChanges) {
    didNormalize = true;
    Object.assign(runs, lifted.runs);
  }

  if (
    !didNormalize &&
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
    messages: lifted.hasChanges ? lifted.messages : messagesWithRunIds,
  };
}

function isReasoningPart(part: UIMessage["parts"][number]): part is { type: "reasoning"; text: string } {
  return part.type === "reasoning" && "text" in part && typeof part.text === "string";
}

// WHY: pre-activity rows stored thinking as a message part after the answer.
// Lift those parts onto the run timeline (ahead of any tools) and strip them
// from the message so restore shows the same widget as a live run.
function liftLegacyReasoningParts(
  messages: UIMessage[],
  runs: Record<string, AssistantRun>,
): { messages: UIMessage[]; runs: Record<string, AssistantRun>; hasChanges: boolean } {
  let hasChanges = false;
  const nextRuns = { ...runs };
  const nextMessages = messages.map((message) => {
    if (!message.parts.some(isReasoningPart)) return message;
    hasChanges = true;
    const reasoningParts = message.parts.filter(isReasoningPart);
    const runId = getMessageRunId(message);
    if (runId) {
      const run = nextRuns[runId];
      if (run && !(run.toolCalls ?? []).some(isReasoningActivity)) {
        const activities: RunReasoningActivity[] = reasoningParts.map((part, index) => ({
          kind: "reasoning",
          id: `${runId}-reasoning-${index}`,
          text: part.text,
          status: "done",
        }));
        nextRuns[runId] = { ...run, toolCalls: [...activities, ...(run.toolCalls ?? [])] };
      }
    }
    return { ...message, parts: message.parts.filter((part) => part.type !== "reasoning") };
  });
  return hasChanges
    ? { messages: nextMessages, runs: nextRuns, hasChanges: true }
    : { messages, runs, hasChanges: false };
}
