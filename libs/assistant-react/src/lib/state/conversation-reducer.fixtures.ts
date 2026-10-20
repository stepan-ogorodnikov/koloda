import { conversationReducer } from "./conversation-reducer";
import { initialConversationState } from "./conversation-types";
import type { ConversationReducerAction } from "./conversation-reducer";

export function reduce(actions: ConversationReducerAction[]) {
  return actions.reduce((state, action) => conversationReducer(state, action), initialConversationState);
}
