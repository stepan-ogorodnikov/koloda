import type { GeneratedCard, ModelParameter, StreamUsage } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { createTextMessage, getAssistantMetadata } from "./assistant-messages";

export type CardStatus = "idle" | "pending" | "success" | "error";

export type RunStatus = "streaming" | "success" | "failed" | "canceled";

export type GenerationRun = {
  id: string;
  mode: AIChatMode;
  status: RunStatus;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  templateFields: TemplateFields | null;
  request?: unknown;
  error?: { message: string };
  startedAt: Date;
  elapsedSeconds: number | null;
  modelName?: string;
  usage?: StreamUsage;
};

export type RevertState = {
  revertedToUserMessageId: string;
  preRevertInputText: string;
};

export type ConversationState = {
  id: string;
  createdAt: Date;
  updatedAt: Date | null;
  messages: UIMessage[];
  runs: Record<string, GenerationRun>;
  activeRunId: string | null;
  dismissedRunErrorId: string | null;
  mode: AIChatMode;
  deckId: number | null;
  profileId: string | null;
  modelId: string | null;
  modelParameters: Partial<Record<ModelParameter["type"], string>>;
  // INVARIANT: A conversation is unread when its latest non-streaming
  // run's id differs from this pointer. The pointer is cleared when the
  // referenced run is dropped so the unread predicate stays correct.
  lastReadRunId: string | null;
  revertState: RevertState | null;
};

export type ConversationAction =
  | { type: "addUserMessage"; runId: string; text: string }
  | {
    type: "addAssistantMessage";
    runId: string;
    kind: "chat-text" | "generated-cards";
    text: string;
  }
  | { type: "updateAssistantText"; runId: string; text: string }
  | {
    type: "startRun";
    runId: string;
    mode: AIChatMode;
    request: unknown;
    templateFields?: TemplateFields | null;
    modelName?: string;
  }
  | { type: "addCard"; runId: string; card: GeneratedCard }
  | { type: "completeRun"; runId: string }
  | { type: "failRun"; runId: string }
  | { type: "runFailed"; runId: string; error: { message: string } }
  | { type: "cancelRun"; runId: string }
  | {
    type: "restartRun";
    runId: string;
    request: unknown;
    templateFields: TemplateFields | null;
    mode: AIChatMode;
    modelName?: string;
  }
  | { type: "setUsage"; runId: string; usage: StreamUsage }
  | { type: "setMode"; mode: AIChatMode }
  | { type: "setDeck"; deckId: number | null }
  | {
    type: "setAIProfile";
    profileId: string | null;
    modelId: string | null;
    modelParameters?: Partial<Record<ModelParameter["type"], string>>;
  }
  | { type: "setAIModel"; modelId: string | null; modelParameters?: Partial<Record<ModelParameter["type"], string>> }
  | { type: "setAIModelParameter"; paramType: ModelParameter["type"]; value: string | null }
  | { type: "dismissRunError"; runId: string }
  | { type: "setCardStatus"; runId: string; index: number; status: CardStatus }
  | { type: "markRead"; runId: string }
  | {
    type: "newConversation";
    id: string;
    createdAt: Date;
    profileId?: string | null;
    modelId?: string | null;
    modelParameters?: Partial<Record<ModelParameter["type"], string>>;
  }
  | { type: "setRevertState"; revertState: RevertState | null }
  | { type: "commitRevert" };

export const initialConversationState: ConversationState = {
  id: "",
  createdAt: new Date(0),
  updatedAt: null,
  messages: [],
  runs: {},
  activeRunId: null,
  dismissedRunErrorId: null,
  mode: "chat",
  deckId: null,
  profileId: null,
  modelId: null,
  modelParameters: {},
  lastReadRunId: null,
  revertState: null,
};

// WHY: With revert active, the target user message and everything after
// it must be hidden from the UI. The conversation state still holds the
// full message list; this function returns the user-visible prefix.
export function getVisibleMessages(
  messages: UIMessage[],
  revertState: RevertState | null,
): UIMessage[] {
  if (!revertState) return messages;
  const userMessageIndex = messages.findIndex(
    (m) => m.id === revertState.revertedToUserMessageId,
  );
  if (userMessageIndex === -1) return messages;
  return messages.slice(0, userMessageIndex);
}

function makeRun(
  runId: string,
  mode: AIChatMode,
  templateFields: TemplateFields | null | undefined,
  modelName?: string,
  request?: unknown,
): GenerationRun {
  return {
    id: runId,
    mode,
    status: "streaming",
    cards: [],
    cardStatuses: {},
    templateFields: templateFields ?? null,
    request,
    startedAt: new Date(),
    elapsedSeconds: null,
    modelName,
  };
}

function updateRun(
  state: ConversationState,
  runId: string,
  updater: (run: GenerationRun) => GenerationRun,
): ConversationState {
  const run = state.runs[runId];
  if (!run) return state;

  return {
    ...state,
    runs: { ...state.runs, [runId]: updater(run) },
  };
}

function finishRun(state: ConversationState, runId: string, status: RunStatus): ConversationState {
  return updateRun(state, runId, (run) => ({
    ...run,
    status,
    elapsedSeconds: Math.floor((Date.now() - run.startedAt.getTime()) / 1000),
  }));
}

export function cancelStreamingRuns(state: ConversationState): ConversationState {
  let next = state;
  let changed = false;
  for (const [runId, run] of Object.entries(state.runs)) {
    if (run.status === "streaming") {
      next = finishRun(next, runId, "canceled");
      changed = true;
    }
  }
  if (!changed) return state;

  return { ...next, activeRunId: null };
}

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
    error: v.error && typeof v.error === "object"
      ? { message: String((v.error as Record<string, unknown>).message ?? "") }
      : undefined,
  };
}

export function coerceConversationState(value: unknown): ConversationState | null {
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

export function normalizeRestoredConversation(state: ConversationState): ConversationState | null {
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
    !normalizedAny
    && state.activeRunId === null
    && state.dismissedRunErrorId === null
    && failedRunIds.size === 0
    && (state.lastReadRunId === null || runs[state.lastReadRunId] !== undefined)
  ) {
    return null;
  }

  const messages = state.messages
    .filter((m) => {
      if (m.role === "user") {
        const runId = m.id.startsWith("user-") ? m.id.slice(5) : null;
        return !runId || !droppedRunIds.has(runId);
      }
      if (m.role === "assistant") {
        const runId = m.id.startsWith("assistant-") ? m.id.slice(10) : null;
        return !runId || !droppedRunIds.has(runId);
      }
      return true;
    })
    .map((m) => {
      if (m.role !== "assistant") return m;
      if (!m.id.startsWith("assistant-")) return m;
      const runId = m.id.slice(10);
      if (!failedRunIds.has(runId)) return m;
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
    lastReadRunId: state.lastReadRunId !== null && runs[state.lastReadRunId] === undefined
      ? null
      : state.lastReadRunId,
    runs,
    messages,
  };
}

export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "addUserMessage":
      return {
        ...state,
        messages: [
          ...state.messages,
          createTextMessage(`user-${action.runId}`, "user", action.text),
        ],
      };

    case "addAssistantMessage":
      return {
        ...state,
        messages: [
          ...state.messages,
          createTextMessage(
            `assistant-${action.runId}`,
            "assistant",
            action.text,
            { kind: action.kind, runId: action.runId },
          ),
        ],
      };

    case "updateAssistantText":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === `assistant-${action.runId}`
            ? {
              ...m,
              parts: [{ type: "text" as const, text: action.text }],
            }
            : m
        ),
      };

    case "startRun":
      return {
        ...state,
        activeRunId: action.runId,
        runs: {
          ...state.runs,
          [action.runId]: makeRun(
            action.runId,
            action.mode,
            action.templateFields,
            action.modelName,
            action.request,
          ),
        },
      };

    case "addCard":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        cards: [...run.cards, action.card],
        cardStatuses: { ...run.cardStatuses, [run.cards.length]: "idle" },
      }));

    case "completeRun": {
      const next = finishRun(state, action.runId, "success");
      return {
        ...next,
        activeRunId: next.activeRunId === action.runId ? null : next.activeRunId,
        runs: next.runs[action.runId]
          ? { ...next.runs, [action.runId]: { ...next.runs[action.runId], error: undefined } }
          : next.runs,
      };
    }

    case "failRun": {
      const next = finishRun(state, action.runId, "failed");
      return {
        ...next,
        activeRunId: next.activeRunId === action.runId ? null : next.activeRunId,
      };
    }

    case "runFailed": {
      return {
        ...updateRun(state, action.runId, (run) => ({
          ...run,
          status: "failed",
          error: action.error,
          elapsedSeconds: Math.floor((Date.now() - run.startedAt.getTime()) / 1000),
        })),
        activeRunId: state.activeRunId === action.runId ? null : state.activeRunId,
      };
    }

    case "cancelRun": {
      const next = finishRun(state, action.runId, "canceled");
      return {
        ...next,
        activeRunId: next.activeRunId === action.runId ? null : next.activeRunId,
      };
    }

    case "restartRun": {
      const run = state.runs[action.runId];
      const nextRun: GenerationRun = run
        ? {
          ...run,
          status: "streaming",
          cards: [],
          cardStatuses: {},
          request: action.request,
          templateFields: action.templateFields,
          startedAt: new Date(),
          elapsedSeconds: null,
          modelName: action.modelName !== undefined ? action.modelName : run.modelName,
          usage: undefined,
          error: undefined,
        }
        : {
          ...makeRun(
            action.runId,
            action.mode,
            action.templateFields,
            action.modelName,
            action.request,
          ),
        };
      const messages = run
        ? state.messages
        : state.messages.map((m) => {
          if (m.id !== `assistant-${action.runId}`) return m;
          const metadata = getAssistantMetadata(m);
          if (metadata?.kind !== "error") return m;
          return {
            ...m,
            metadata: {
              kind: action.mode === "cards" ? "generated-cards" as const : "chat-text" as const,
              runId: action.runId,
            },
          };
        });

      return {
        ...state,
        activeRunId: action.runId,
        runs: { ...state.runs, [action.runId]: nextRun },
        messages,
      };
    }

    case "setUsage":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        usage: action.usage,
      }));

    case "setMode":
      return { ...state, mode: action.mode };

    case "setDeck":
      return { ...state, deckId: action.deckId };

    case "setAIProfile":
      return {
        ...state,
        profileId: action.profileId,
        modelId: action.modelId,
        modelParameters: action.modelParameters ?? {},
      };

    case "setAIModel":
      return {
        ...state,
        modelId: action.modelId,
        modelParameters: action.modelParameters ?? {},
      };

    case "setAIModelParameter": {
      const { paramType, value } = action;
      const nextParameters = { ...state.modelParameters };
      if (value === null || value === "") {
        delete nextParameters[paramType];
      } else {
        nextParameters[paramType] = value;
      }
      return { ...state, modelParameters: nextParameters };
    }

    case "setCardStatus":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        cardStatuses: { ...run.cardStatuses, [action.index]: action.status },
      }));

    case "dismissRunError":
      return { ...state, dismissedRunErrorId: action.runId };

    case "markRead": {
      // WHY: An unknown run id is ignored (no pointer to update). The
      // pointer is replaced only when it actually changes, so the
      // reducer avoids allocating a new state on the idempotent path.
      // The `applyConversationUpdate` helper is what guarantees a
      // `markRead` never stamps `updatedAt` — see its comment.
      if (!state.runs[action.runId]) return state;
      if (state.lastReadRunId === action.runId) return state;
      return { ...state, lastReadRunId: action.runId };
    }

    case "newConversation":
      return {
        id: action.id,
        createdAt: action.createdAt,
        updatedAt: null,
        messages: [],
        runs: {},
        activeRunId: null,
        dismissedRunErrorId: null,
        mode: "chat",
        deckId: null,
        profileId: action.profileId ?? null,
        modelId: action.modelId ?? null,
        modelParameters: action.modelParameters ?? {},
        lastReadRunId: null,
        revertState: null,
      };

    case "setRevertState": {
      if (state.revertState === action.revertState) return state;
      return { ...state, revertState: action.revertState };
    }

    case "commitRevert": {
      if (!state.revertState) return state;
      const { revertedToUserMessageId } = state.revertState;
      const userMessageIndex = state.messages.findIndex(
        (m) => m.id === revertedToUserMessageId,
      );
      if (userMessageIndex === -1) {
        // WHY: Stale revert state (target message was removed by some
        // other path). Clear the revert state so the UI stops hiding
        // nothing; nothing actually needs deleting.
        return { ...state, revertState: null };
      }

      const messages = state.messages.slice(0, userMessageIndex);

      const survivingRunIds = new Set<string>();
      for (const m of messages) {
        if (m.role === "user" && m.id.startsWith("user-")) {
          survivingRunIds.add(m.id.slice(5));
        } else if (m.role === "assistant" && m.id.startsWith("assistant-")) {
          survivingRunIds.add(m.id.slice(10));
        }
      }
      const runs: Record<string, GenerationRun> = {};
      for (const [id, r] of Object.entries(state.runs)) {
        if (survivingRunIds.has(id)) runs[id] = r;
      }

      const lastReadRunId = state.lastReadRunId !== null && runs[state.lastReadRunId] === undefined
        ? null
        : state.lastReadRunId;

      return {
        ...state,
        messages,
        runs,
        activeRunId: null,
        dismissedRunErrorId: null,
        lastReadRunId,
        revertState: null,
      };
    }

    default:
      return state;
  }
}
