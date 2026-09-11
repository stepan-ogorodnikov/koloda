import { dispatchReducerAction } from "@koloda/core-react";
import type { ReducerAction } from "@koloda/core-react";
import { produce } from "immer";
import type { ConversationReducerState } from "./conversation-types";
import { cancelRun, completeRun, interruptRun, restartRun, runFailed, setUsage } from "./conversation-run-lifecycle";
import {
  appendAssistantReasoning,
  rollbackSubmitTurn,
  submitTurn,
  updateAssistantText,
} from "./conversation-run-stream";
import { addCard, addToolCall, setCardStatus, setToolCallResult } from "./conversation-run-tools";
import {
  commitRevert,
  dismissRunError,
  markRead,
  newConversation,
  setAIModel,
  setAIModelParameter,
  setAIProfile,
  setPromptInput,
  setRevertState,
} from "./conversation-session";

export * from "./conversation-types";

export { dropRuns, findLatestErroredRun, getVisibleMessages, hasRetryableTurn } from "./conversation-run-helpers";

export { boundToolError, boundToolOutput } from "./conversation-run-tools";

const actions = {
  updateAssistantText,
  appendAssistantReasoning,
  submitTurn,
  rollbackSubmitTurn,
  addCard,
  setCardStatus,
  addToolCall,
  setToolCallResult,
  completeRun,
  runFailed,
  cancelRun,
  interruptRun,
  restartRun,
  setUsage,
  setAIProfile,
  setAIModel,
  setAIModelParameter,
  dismissRunError,
  markRead,
  newConversation,
  setPromptInput,
  setRevertState,
  commitRevert,
};

export type ConversationReducerAction = ReducerAction<typeof actions, ConversationReducerState>;

export function conversationReducer(state: ConversationReducerState, action: ConversationReducerAction) {
  return produce(state, (draft) => {
    dispatchReducerAction(draft as ConversationReducerState, actions, action);
  });
}
