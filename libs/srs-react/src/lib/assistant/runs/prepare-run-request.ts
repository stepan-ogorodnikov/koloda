import type { AIChatMode } from "@koloda/ai";
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

export function createExecutionIdentity(
  cfg: AssistantConversationConfig,
  kind: StreamRequestResult["kind"],
): AssistantExecutionIdentity {
  if (kind !== "cards") return { profileId: cfg.profileId };

  const template = cfg.template;
  if (!template) throw new Error("Card generation requires a template");
  return {
    profileId: cfg.profileId,
    template: {
      id: template.id,
      content: { fields: template.content.fields },
    },
  };
}

/**
 * Shared guard + request builder for a new run. Returns `null` when the
 * prompt/config is invalid, so callers early-return *before* starting a
 * stream. Centralizing the guard stack here is what lets `handleRetry`
 * execute only after validation.
 *
 * `dataAccess` is the submit-time snapshot resolved by React land; this
 * framework-free prep only embeds it into the request — it never resolves.
 */
export function prepareRunRequest(
  cfg: AssistantConversationConfig,
  mode: AIChatMode,
  promptText: string,
  messages: ConversationReducerState["messages"],
  runs: Record<string, GenerationRun>,
  dataAccess?: DataAccessSnapshot,
): PreparedRun | null {
  if (!promptText || !cfg.profileId || !cfg.modelId) return null;
  if (mode === "cards" && !cfg.template) return null;

  const conversationMessages = buildConversationMessages(messages, runs, cfg.template);
  const result = buildStreamRequest(cfg, mode, promptText, conversationMessages, dataAccess);
  return {
    ...result,
    modelName: cfg.modelName,
    execution: createExecutionIdentity(cfg, result.kind),
  };
}

/** Build the typed engine submit command from a prepared run. */
export function toSubmitCommand(conversationId: string, runId: string, prepared: PreparedRun): AssistantCommand {
  if (prepared.kind === "chat") {
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
  return {
    type: "submit",
    conversationId,
    input: {
      kind: "cards",
      runId,
      request: prepared.request,
      execution: prepared.execution,
    },
  };
}

/**
 * Build the typed engine retry command from a prepared run. `dataAccess` is
 * the snapshot the retry replays (stored on the run, or freshly resolved for
 * a pre-feature run) — it rides the command so the restart stores it on the
 * run record, mirroring how `submitTurn` stores the submit-time snapshot.
 */
export function toRetryCommand(
  conversationId: string,
  runId: string,
  mode: AIChatMode,
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
      mode,
      modelName: prepared.modelName,
      execution: prepared.execution,
      dataAccess,
    },
  };
}
