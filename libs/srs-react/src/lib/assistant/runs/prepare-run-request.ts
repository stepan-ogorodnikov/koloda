import type { AssistantCommand, AssistantExecutionIdentity } from "@koloda/assistant";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { buildConversationMessages } from "../state/assistant-messages";
import type { ConversationReducerState, GenerationRun } from "../state/conversation-reducer";
import type { StreamRequestResult } from "./build-stream-request";
import { buildStreamRequest } from "./build-stream-request";
import type { DataAccessSnapshot } from "./data-access";

/**
 * Framework-free submit/retry preparation: validate config + prompt, build the
 * provider request, and snapshot execution identity. React/Jotai stay out —
 * hooks only project UI state and dispatch the resulting command.
 */
export type PreparedRun = StreamRequestResult & {
  modelName: string | undefined;
  execution: AssistantExecutionIdentity;
};

export function createExecutionIdentity(cfg: AssistantConversationConfig): AssistantExecutionIdentity {
  return { profileId: cfg.profileId };
}

/**
 * Shared guard + request builder for a new run. Returns `null` when the
 * prompt/config is invalid, so callers early-return *before* starting a
 * stream. Centralizing the guard stack here is what lets `handleRetry`
 * execute only after validation.
 *
 * Prep is chat-only. A stored `dataAccess` snapshot is never embedded into
 * the request (tools, not injection).
 */
export function prepareRunRequest(
  cfg: AssistantConversationConfig,
  promptText: string,
  messages: ConversationReducerState["messages"],
  runs: Record<string, GenerationRun>,
): PreparedRun | null {
  if (!promptText || !cfg.profileId || !cfg.modelId) return null;

  const conversationMessages = buildConversationMessages(messages, runs, cfg.template);
  const result = buildStreamRequest(cfg, promptText, conversationMessages);
  return {
    ...result,
    modelName: cfg.modelName,
    execution: createExecutionIdentity(cfg),
  };
}

/** Build the typed engine submit command from a prepared run. */
export function toSubmitCommand(conversationId: string, runId: string, prepared: PreparedRun): AssistantCommand {
  return {
    type: "submit",
    conversationId,
    input: {
      kind: "chat",
      runId,
      request: prepared.request,
      execution: prepared.execution,
    },
  };
}

/**
 * Build the typed engine retry command from a prepared run. `dataAccess` rides
 * the command so restart stores it on the run record as inert metadata
 * (never embedded — ChatStreamRequest has no dataContext).
 */
export function toRetryCommand(
  conversationId: string,
  runId: string,
  prepared: PreparedRun,
  dataAccess?: DataAccessSnapshot,
): AssistantCommand {
  return {
    type: "retry",
    conversationId,
    input: {
      runId,
      request: prepared.request,
      templateFields: prepared.templateFields,
      mode: "chat",
      modelName: prepared.modelName,
      execution: prepared.execution,
      dataAccess,
    },
  };
}
