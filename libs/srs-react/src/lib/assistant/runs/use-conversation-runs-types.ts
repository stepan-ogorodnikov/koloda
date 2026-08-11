import type { AssistantCommand } from "@koloda/assistant";
import type { ConversationReducerAction } from "../state/conversation-reducer";

export type DispatchToConversation = (id: string, action: ConversationReducerAction) => void;

/**
 * Thin React adapter over the application-shell {@link AssistantEngine}.
 * Production execution goes only through typed {@link AssistantCommand} dispatch.
 */
export type UseConversationRunsReturn = {
  dispatch: (command: AssistantCommand) => void | Promise<void>;
};
