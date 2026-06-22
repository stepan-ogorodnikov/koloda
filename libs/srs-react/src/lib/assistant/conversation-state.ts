import type { GeneratedCard, StreamUsage } from "@koloda/ai";
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
  usage?: StreamUsage;
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
  | { type: "startRun"; runId: string; mode: AIChatMode; request: unknown; templateFields?: TemplateFields | null }
  | { type: "addCard"; runId: string; card: GeneratedCard }
  | { type: "completeRun"; runId: string }
  | { type: "failRun"; runId: string }
  | { type: "runFailed"; runId: string; error: { message: string } }
  | { type: "cancelRun"; runId: string }
  | { type: "restartRun"; runId: string; request: unknown; templateFields: TemplateFields | null }
  | { type: "setUsage"; runId: string; usage: StreamUsage }
  | { type: "setMode"; mode: AIChatMode }
  | { type: "setDeck"; deckId: number | null }
  | { type: "dismissRunError"; runId: string }
  | { type: "setCardStatus"; runId: string; index: number; status: CardStatus }
  | { type: "newConversation"; id: string; createdAt: Date };

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
};

function makeRun(
  runId: string,
  mode: AIChatMode,
  templateFields: TemplateFields | null | undefined,
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

function isLocked(state: ConversationState): boolean {
  return state.messages.some((m) => {
    if (m.role !== "assistant") return false;
    const metadata = getAssistantMetadata(m);
    if (metadata?.kind !== "generated-cards") return false;
    return state.runs[metadata.runId]?.status === "success";
  });
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
  };
}

export function normalizeRestoredConversation(state: ConversationState): ConversationState | null {
  let normalizedAny = false;
  const runs: Record<string, GenerationRun> = {};
  const failedRunIds = new Set<string>();

  for (const [runId, run] of Object.entries(state.runs)) {
    if (run.status === "streaming" || run.status === "failed") {
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

  if (!normalizedAny && state.activeRunId === null && state.dismissedRunErrorId === null && failedRunIds.size === 0) {
    return null;
  }

  const messages = state.messages.filter((m) => {
    const isUser = m.id.startsWith("user-");
    const isAssistant = m.id.startsWith("assistant-");
    if (!isUser && !isAssistant) return true;
    const idSuffix = m.id.slice(isUser ? 5 : 10);
    return !failedRunIds.has(idSuffix);
  });

  return { ...state, activeRunId: null, dismissedRunErrorId: null, runs, messages };
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
          [action.runId]: makeRun(action.runId, action.mode, action.templateFields, action.request),
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
      if (!run) return state;
      return {
        ...state,
        activeRunId: action.runId,
        runs: {
          ...state.runs,
          [action.runId]: {
            ...run,
            status: "streaming",
            cards: [],
            cardStatuses: {},
            request: action.request,
            templateFields: action.templateFields,
            startedAt: new Date(),
            elapsedSeconds: null,
            usage: undefined,
            error: undefined,
          },
        },
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
      if (isLocked(state)) return state;
      return { ...state, deckId: action.deckId };

    case "setCardStatus":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        cardStatuses: { ...run.cardStatuses, [action.index]: action.status },
      }));

    case "dismissRunError":
      return { ...state, dismissedRunErrorId: action.runId };

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
      };

    default:
      return state;
  }
}
