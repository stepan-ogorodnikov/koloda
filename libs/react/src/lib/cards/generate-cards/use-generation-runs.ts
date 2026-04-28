import type { GeneratedCard } from "@koloda/srs";
import { useCallback, useReducer } from "react";
import type { GenerationMode } from "./generate-cards-utility";

export type RunStatus = "streaming" | "success" | "failed" | "canceled";

export type GenerationRun = {
  id: string;
  mode: GenerationMode;
  status: RunStatus;
  cards: GeneratedCard[];
  request?: unknown;
  startedAt: number;
  elapsedSeconds: number | null;
};

export type RunsState = {
  activeRunId: string | null;
  runs: Record<string, GenerationRun>;
};

type RunsAction =
  | { type: "start"; id: string; mode: GenerationMode; request?: unknown }
  | { type: "addCard"; id: string; card: GeneratedCard }
  | { type: "complete"; id: string }
  | { type: "fail"; id: string }
  | { type: "cancel"; id: string }
  | { type: "restart"; id: string }
  | { type: "reset" };

const initialState: RunsState = {
  activeRunId: null,
  runs: {},
};

function runsReducer(state: RunsState, action: RunsAction): RunsState {
  switch (action.type) {
    case "start":
      return {
        activeRunId: action.id,
        runs: {
          ...state.runs,
          [action.id]: {
            id: action.id,
            mode: action.mode,
            status: "streaming",
            cards: [],
            request: action.request,
            startedAt: Date.now(),
            elapsedSeconds: null,
          },
        },
      };

    case "addCard": {
      const run = state.runs[action.id];
      if (!run) return state;
      return {
        ...state,
        runs: {
          ...state.runs,
          [action.id]: { ...run, cards: [...run.cards, action.card] },
        },
      };
    }

    case "complete": {
      const run = state.runs[action.id];
      if (!run) return state;
      return {
        ...state,
        activeRunId: state.activeRunId === action.id ? null : state.activeRunId,
        runs: {
          ...state.runs,
          [action.id]: {
            ...run,
            status: "success",
            elapsedSeconds: Math.floor((Date.now() - run.startedAt) / 1000),
          },
        },
      };
    }

    case "fail": {
      const run = state.runs[action.id];
      if (!run) return state;
      return {
        ...state,
        activeRunId: state.activeRunId === action.id ? null : state.activeRunId,
        runs: {
          ...state.runs,
          [action.id]: {
            ...run,
            status: "failed",
            elapsedSeconds: Math.floor((Date.now() - run.startedAt) / 1000),
          },
        },
      };
    }

    case "cancel": {
      const run = state.runs[action.id];
      if (!run) return state;
      return {
        ...state,
        activeRunId: state.activeRunId === action.id ? null : state.activeRunId,
        runs: {
          ...state.runs,
          [action.id]: {
            ...run,
            status: "canceled",
            elapsedSeconds: Math.floor((Date.now() - run.startedAt) / 1000),
          },
        },
      };
    }

    case "restart": {
      const run = state.runs[action.id];
      if (!run) return state;
      return {
        ...state,
        activeRunId: action.id,
        runs: {
          ...state.runs,
          [action.id]: { ...run, status: "streaming", cards: [], startedAt: Date.now(), elapsedSeconds: null },
        },
      };
    }

    case "reset":
      return initialState;

    default:
      return state;
  }
}

export function useGenerationRuns() {
  const [state, dispatch] = useReducer(runsReducer, initialState);

  const startRun = useCallback((id: string, mode: GenerationMode, request?: unknown) => {
    dispatch({ type: "start", id, mode, request });
  }, []);

  const addCard = useCallback((id: string, card: GeneratedCard) => {
    dispatch({ type: "addCard", id, card });
  }, []);

  const completeRun = useCallback((id: string) => {
    dispatch({ type: "complete", id });
  }, []);

  const failRun = useCallback((id: string) => {
    dispatch({ type: "fail", id });
  }, []);

  const cancelRun = useCallback((id: string) => {
    dispatch({ type: "cancel", id });
  }, []);

  const restartRun = useCallback((id: string) => {
    dispatch({ type: "restart", id });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const getRun = useCallback(
    (id: string) => state.runs[id],
    [state.runs],
  );

  return {
    activeRunId: state.activeRunId,
    runs: state.runs,
    startRun,
    addCard,
    completeRun,
    failRun,
    cancelRun,
    restartRun,
    reset,
    getRun,
  };
}
