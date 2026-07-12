import { conversationReducer, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerAction } from "./conversation-reducer";

// Helper: convert old-style action objects to new tuple format for tests
export function act(action: { type: string; [key: string]: unknown }): ConversationReducerAction {
  const { type, ...rest } = action;
  // WHY: `setRevertState` takes the revert state itself (not a wrapper
  // object) as its payload — see conversation-reducer.ts. Unwrap it here
  // so the test calls read `act({ type: "setRevertState", revertState })`
  // instead of repeating the wrapper at every call site.
  if (type === "setRevertState") {
    return [type, rest.revertState] as ConversationReducerAction;
  }
  const keys = Object.keys(rest);
  if (keys.length === 0) return [type] as ConversationReducerAction;
  return [type, rest] as ConversationReducerAction;
}

export function reduce(actions: Array<{ type: string; [key: string]: unknown }>) {
  return actions.reduce((state, action) => conversationReducer(state, act(action)), initialConversationState);
}
