import type { AssistantCommand } from "@koloda/assistant";

/**
 * Thin React adapter over the application-shell {@link AssistantEngine}.
 * Production execution goes only through typed {@link AssistantCommand} dispatch.
 */
export type UseConversationRunsReturn = {
  dispatch: (command: AssistantCommand) => void | Promise<void>;
};
