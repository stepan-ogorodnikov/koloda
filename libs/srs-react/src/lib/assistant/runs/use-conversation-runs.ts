import { getAssistantEngine } from "./use-assistant-engine-host";
import type { UseConversationRunsReturn } from "./use-conversation-runs-types";

/**
 * Thin React adapter over the route-scoped {@link AssistantEngine}.
 * Run lifetime and AbortControllers live in the engine — not in this hook.
 * Callers must use typed {@link AssistantCommand} via `dispatch` only.
 */
export function useConversationRuns(): UseConversationRunsReturn {
  const engine = getAssistantEngine();

  return { dispatch: engine.dispatch };
}

export type { DispatchToConversation, UseConversationRunsReturn } from "./use-conversation-runs-types";
