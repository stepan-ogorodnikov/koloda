import type { GeneratedCard, ModelParameter, StreamUsage } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { produce } from "immer";
import { getAssistantMetadata, getRunIdFromMessageId } from "./assistant-messages";
import { dropRuns } from "./conversation-reducer";
import type { CardStatus, ConversationReducerState, GenerationRun, RunStatus } from "./conversation-reducer";

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);

  return null;
}

function coerceRun(value: unknown): GenerationRun | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return null;
  if (v.mode !== "chat" && v.mode !== "cards") return null;
  if (typeof v.status !== "string") return null;
  if (!Array.isArray(v.cards)) return null;
  if (!v.cardStatuses || typeof v.cardStatuses !== "object") return null;
  const startedAt = toDate(v.startedAt);
  if (!startedAt) return null;
  if (v.elapsedSeconds !== null && typeof v.elapsedSeconds !== "number") return null;
  if (v.templateFields !== null && !v.templateFields) return null;
  if (v.modelName !== null && v.modelName !== undefined && typeof v.modelName !== "string") return null;

  return {
    id: v.id,
    mode: v.mode,
    status: v.status as RunStatus,
    cards: v.cards as GeneratedCard[],
    cardStatuses: v.cardStatuses as Record<number, CardStatus>,
    templateFields: (v.templateFields ?? null) as TemplateFields | null,
    request: v.request,
    startedAt,
    elapsedSeconds: (v.elapsedSeconds as number | null) ?? null,
    modelName: (v.modelName as string | undefined) ?? undefined,
    usage: v.usage as StreamUsage | undefined,
    error:
      v.error && typeof v.error === "object"
        ? { message: String((v.error as Record<string, unknown>).message ?? "") }
        : undefined,
  };
}

export function coerceConversationState(value: unknown): ConversationReducerState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return null;
  const createdAt = toDate(v.createdAt);
  if (!createdAt) return null;
  const updatedAt = toDate(v.updatedAt);
  if (v.updatedAt !== null && !updatedAt) return null;
  if (!Array.isArray(v.messages)) return null;
  if (!v.runs || typeof v.runs !== "object") return null;
  if (v.activeRunId !== null && typeof v.activeRunId !== "string") return null;
  if (v.mode !== "chat" && v.mode !== "cards") return null;
  if (v.deckId !== null && typeof v.deckId !== "number") return null;
  if (v.profileId !== null && v.profileId !== undefined && typeof v.profileId !== "string") return null;
  if (v.modelId !== null && v.modelId !== undefined && typeof v.modelId !== "string") return null;
  if (v.lastReadRunId !== null && v.lastReadRunId !== undefined && typeof v.lastReadRunId !== "string") return null;
  let modelParameters: Partial<Record<ModelParameter["type"], string>> = {};
  if (v.modelParameters !== null && v.modelParameters !== undefined) {
    if (typeof v.modelParameters !== "object") return null;
    for (const [key, val] of Object.entries(v.modelParameters as Record<string, unknown>)) {
      if (val === null) continue;
      if (typeof val !== "string") return null;
      modelParameters[key as ModelParameter["type"]] = val;
    }
  }

  const runs: Record<string, GenerationRun> = {};
  for (const [runId, run] of Object.entries(v.runs as Record<string, unknown>)) {
    const coerced = coerceRun(run);
    if (!coerced) return null;
    runs[runId] = coerced;
  }

  return {
    id: v.id,
    createdAt,
    updatedAt,
    messages: v.messages as UIMessage[],
    runs,
    activeRunId: (v.activeRunId as string | null) ?? null,
    dismissedRunErrorId: (v.dismissedRunErrorId as string | null) ?? null,
    mode: v.mode,
    deckId: (v.deckId as number | null) ?? null,
    profileId: (v.profileId as string | null) ?? null,
    modelId: (v.modelId as string | null) ?? null,
    modelParameters,
    lastReadRunId: (v.lastReadRunId as string | null) ?? null,
    // WHY: Revert is in-memory only. The DB never stores it; if a
    // stale row ever contains one, ignore it and start clean.
    revertState: null,
  };
}

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
