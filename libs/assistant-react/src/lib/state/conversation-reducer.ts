import { dispatchReducerAction } from "@koloda/core-react";
import type { ReducerAction } from "@koloda/core-react";
import { produce } from "immer";
import type { ConversationReducerState } from "./conversation-types";
import {
  cancelRun,
  completeRun,
  interruptRun,
  markStepBudgetReached,
  restartRun,
  runFailed,
  setUsage,
} from "./conversation-run-lifecycle";
import {
  appendAssistantReasoning,
  rollbackSubmitTurn,
  submitTurn,
  updateAssistantText,
} from "./conversation-run-stream";
import { addToolCall, setCardStatus, setToolCallResult } from "./conversation-run-tools";
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

const actions = {
  updateAssistantText,
  appendAssistantReasoning,
  submitTurn,
  rollbackSubmitTurn,
  setCardStatus,
  addToolCall,
  setToolCallResult,
  completeRun,
  runFailed,
  cancelRun,
  interruptRun,
  restartRun,
  markStepBudgetReached,
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
