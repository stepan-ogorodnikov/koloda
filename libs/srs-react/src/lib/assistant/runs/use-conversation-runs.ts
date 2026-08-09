import type { UseConversationRunsOptions, UseConversationRunsReturn } from "./use-conversation-runs-types";
import { getAssistantEngine, registerAssistantEngineTransports } from "./use-assistant-engine-host";

/**
 * Thin React adapter over the route-scoped {@link AssistantEngine}.
 * Run lifetime and AbortControllers live in the engine — not in this hook.
 */
export function useConversationRuns({
  streamGenerator,
  chatStreamGenerator,
}: UseConversationRunsOptions): UseConversationRunsReturn {
  registerAssistantEngineTransports({ chatStreamGenerator, streamGenerator });

  const engine = getAssistantEngine();

  return {
    executeChatRun: engine.executeChatRun,
    executeGenerateRun: engine.executeGenerateRun,
    retryRun: engine.retryRun,
    cancel: engine.cancel,
  };
}

export type {
  DispatchToConversation,
  UseConversationRunsOptions,
  UseConversationRunsReturn,
} from "./use-conversation-runs-types";
