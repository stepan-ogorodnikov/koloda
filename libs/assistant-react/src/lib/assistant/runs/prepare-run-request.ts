import type { AssistantCommand, AssistantExecutionIdentity } from "@koloda/assistant";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import {
  assistantMessageId,
  buildConversationMessages,
  getMessageRunId,
  userMessageId,
} from "../state/assistant-messages";
import type { ConversationReducerState, AssistantRun } from "../state/conversation-reducer";
import type { StreamRequestResult } from "./build-stream-request";
import { buildStreamRequest } from "./build-stream-request";

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
  runs: Record<string, AssistantRun>,
  options?: { excludeRunId?: string },
): PreparedRun | null {
  if (!promptText || !cfg.profileId || !cfg.modelId) return null;

  // WHY: Retry reuses the visible tail pair as the new prompt. The pair is
  // already in `messages`, and buildStreamRequest appends `promptText` once
  // more — without exclusion the provider sees [.., user(prompt), user(prompt)]
  // (plus any leftover failed assistant text). Submit passes pre-commit
  // history, so it needs no exclusion.
  const excludeRunId = options?.excludeRunId;
  const historyMessages = excludeRunId
    ? messages.filter(
        (m) =>
          m.id !== userMessageId(excludeRunId) &&
          m.id !== assistantMessageId(excludeRunId) &&
          getMessageRunId(m) !== excludeRunId,
      )
    : messages;
  const conversationMessages = buildConversationMessages(historyMessages, runs);
  const result = buildStreamRequest(cfg, promptText, conversationMessages);
  return {
    ...result,
    modelName: cfg.modelName,
    execution: createExecutionIdentity(cfg),
  };
}

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

export function toRetryCommand(conversationId: string, runId: string, prepared: PreparedRun): AssistantCommand {
  return {
    type: "retry",
    conversationId,
    input: {
      runId,
      request: prepared.request,
      templateFields: prepared.templateFields,
      modelName: prepared.modelName,
      execution: prepared.execution,
    },
  };
}
