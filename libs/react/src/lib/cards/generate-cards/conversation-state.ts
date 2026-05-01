import type { GeneratedCard, StreamUsage } from "@koloda/ai";
import type { UIMessage } from "ai";
import { createTextMessage, type GenerationMode } from "./generate-cards-utility";

export type RunStatus = "streaming" | "success" | "failed" | "canceled";

export type GenerationRun = {
  id: string;
  mode: GenerationMode;
  status: RunStatus;
  cards: GeneratedCard[];
  request?: unknown;
  startedAt: number;
  elapsedSeconds: number | null;
  usage?: StreamUsage;
};

export type ConversationState = {
  messages: UIMessage[];
  runs: Record<string, GenerationRun>;
  activeRunId: string | null;
  mode: GenerationMode;
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
  | { type: "startRun"; runId: string; mode: GenerationMode; request: unknown }
  | { type: "addCard"; runId: string; card: GeneratedCard }
  | { type: "completeRun"; runId: string }
  | { type: "failRun"; runId: string }
  | { type: "cancelRun"; runId: string }
  | { type: "restartRun"; runId: string }
  | { type: "setUsage"; runId: string; usage: StreamUsage }
  | { type: "setMode"; mode: GenerationMode }
  | { type: "reset" };

export const initialConversationState: ConversationState = {
  messages: [],
  runs: {},
  activeRunId: null,
  mode: "chat",
};

function makeRun(
  runId: string,
  mode: GenerationMode,
  request?: unknown,
): GenerationRun {
  return {
    id: runId,
    mode,
    status: "streaming",
    cards: [],
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

function finishRun(
  state: ConversationState,
  runId: string,
  status: RunStatus,
): ConversationState {
  return updateRun(state, runId, (run) => ({
    ...run,
    status,
    elapsedSeconds: Math.floor((Date.now() - run.startedAt) / 1000),
  }));
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
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
          [action.runId]: makeRun(action.runId, action.mode, action.request),
        },
      };

    case "addCard":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        cards: [...run.cards, action.card],
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

    case "reset":
      return initialConversationState;

    default:
      return state;
  }
}
