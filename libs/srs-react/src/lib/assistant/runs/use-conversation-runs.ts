import { getAssistantEngine } from "./use-assistant-engine-host";
import type { UseConversationRunsReturn } from "./use-conversation-runs-types";

/**
 * Thin React adapter over the route-scoped {@link AssistantEngine}.
 * Run lifetime and AbortControllers live in the engine — not in this hook.
 */
export function useConversationRuns(): UseConversationRunsReturn {
  const engine = getAssistantEngine();

  return {
    executeChatRun: engine.executeChatRun,
    executeGenerateRun: engine.executeGenerateRun,
    retryRun: engine.retryRun,
    cancel: engine.cancel,
  };
}

export type { DispatchToConversation, UseConversationRunsReturn } from "./use-conversation-runs-types";
