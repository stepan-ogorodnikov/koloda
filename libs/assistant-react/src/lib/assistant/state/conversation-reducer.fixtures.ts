import { conversationReducer, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerAction } from "./conversation-reducer";

export function reduce(actions: ConversationReducerAction[]) {
  return actions.reduce((state, action) => conversationReducer(state, action), initialConversationState);
}
