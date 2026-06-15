import type { GeneratedCard, StreamUsage } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { createTextMessage } from "./assistant-messages";

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
  error?: string;
  startedAt: number;
  elapsedSeconds: number | null;
  usage?: StreamUsage;
};

export type ConversationState = {
  id: string;
  createdAt: number;
  messages: UIMessage[];
  runs: Record<string, GenerationRun>;
  activeRunId: string | null;
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
  | { type: "cancelRun"; runId: string }
  | { type: "restartRun"; runId: string; request: unknown; templateFields: TemplateFields | null }
  | { type: "setUsage"; runId: string; usage: StreamUsage }
  | { type: "setMode"; mode: AIChatMode }
  | { type: "setDeck"; deckId: number | null }
  | { type: "setCardStatus"; runId: string; index: number; status: CardStatus }
  | { type: "newConversation"; id: string; createdAt: number };

export const initialConversationState: ConversationState = {
  id: "",
  createdAt: 0,
  messages: [],
  runs: {},
  activeRunId: null,
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
    startedAt: Date.now(),
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
    elapsedSeconds: Math.floor((Date.now() - run.startedAt) / 1000),
  }));
}

function isLocked(state: ConversationState): boolean {
  return state.messages.some((m) => m.role === "user");
}

export function isConversationState(value: unknown): value is ConversationState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string"
    && typeof v.createdAt === "number"
    && Array.isArray(v.messages)
    && typeof v.runs === "object"
    && v.runs !== null
    && (v.activeRunId === null || typeof v.activeRunId === "string")
    && (v.mode === "chat" || v.mode === "cards")
    && (v.deckId === null || typeof v.deckId === "number")
  );
}

export function normalizeRestoredConversation(state: ConversationState): ConversationState {
  let normalizedAny = false;
  const runs: Record<string, GenerationRun> = {};

  for (const [runId, run] of Object.entries(state.runs)) {
    let nextRun: GenerationRun = run;
    let runChanged = false;

    if (run.status === "streaming") {
      nextRun = {
        ...nextRun,
        status: "failed",
        error: "interrupted",
        elapsedSeconds: run.elapsedSeconds ?? Math.floor((Date.now() - run.startedAt) / 1000),
      };
      runChanged = true;
    }

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

  if (!normalizedAny) return state;

  return { ...state, activeRunId: null, runs };
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
      };
    }

    case "failRun": {
      const next = finishRun(state, action.runId, "failed");
      return {
        ...next,
        activeRunId: next.activeRunId === action.runId ? null : next.activeRunId,
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
            startedAt: Date.now(),
            elapsedSeconds: null,
            usage: undefined,
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

    case "newConversation":
      return {
        id: action.id,
        createdAt: action.createdAt,
        messages: [],
        runs: {},
        activeRunId: null,
        mode: "chat",
        deckId: null,
      };

    default:
      return state;
  }
}
