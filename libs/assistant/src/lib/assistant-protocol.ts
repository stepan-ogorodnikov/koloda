import type { AssistantToolEvent, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { AssistantExecutionIdentity, ImmutableExecutionValue } from "./assistant-execution-port";

/**
 * Typed commands the application layer may send into {@link AssistantEngine}.
 * Conversation ownership is always explicit — never inferred from UI-current state.
 */
export type SubmitInput = ImmutableExecutionValue<{
  kind: "chat";
  runId: string;
  execution: AssistantExecutionIdentity;
  request: ChatStreamRequest;
}>;

/**
 * Data access snapshot replayed by retry: the context text sent with the
 * request plus its manifest. Opaque to the engine — carried to the
 * `runStarted` event untouched; the store adapter owns the manifest type.
 */
export type RetryInput = ImmutableExecutionValue<{
  runId: string;
  execution: AssistantExecutionIdentity;
  request: ChatStreamRequest;
  templateFields: TemplateFields | null;
  modelName?: string;
}>;

/** Host-supplied interrupt + flush budget for graceful engine teardown. */
export type ShutdownInput = {
  interruptActiveRuns: () => void;
  flushTimeoutMs?: number;
};

/**
 * Sole public execution ingress for {@link AssistantEngine.dispatch}.
 * Submit preparation lives outside the engine (framework-free service in the host adapter).
 */
export type AssistantCommand =
  | { type: "submit"; conversationId: string; input: SubmitInput }
  | { type: "retry"; conversationId: string; input: RetryInput }
  | { type: "cancel"; conversationId: string; runId: string }
  | { type: "shutdown"; input: ShutdownInput };

/** Snapshot carried on retry restart — identity only; full run records stay in the store. */
export type RunStartSnapshot = {
  runId: string;
  templateFields: TemplateFields | null;
  modelName?: string;
};

// WHY: the tool kinds are `@koloda/ai`'s AssistantToolEvent verbatim so hosts
// forward streamed tool activity into run chunks without adaptation.
export type RunChunk =
  | { kind: "assistantText"; text: string }
  | { kind: "reasoning"; text: string }
  | { kind: "card"; card: GeneratedCard }
  | { kind: "usage"; usage: StreamUsage }
  | AssistantToolEvent;

export type AssistantRunError = {
  message: string;
  details?: string;
};

// WHY: details carry raw exception/provider text, and run errors ride the
// persisted conversation blob rewritten on every autosave. Not a shaping
// budget (provider bodies are already capped in @koloda/ai) — a backstop
// against a pathological payload growing storage unboundedly.
export const MAX_RUN_ERROR_DETAILS_CHARS = 16_000;

export function boundRunErrorDetails(details: string | undefined): string | undefined {
  if (details === undefined) return undefined;
  if (details.length <= MAX_RUN_ERROR_DETAILS_CHARS) return details;
  return `${details.slice(0, MAX_RUN_ERROR_DETAILS_CHARS)}…`;
}

export type RunOutcome =
  | { status: "success" }
  | { status: "failed"; error: AssistantRunError }
  | { status: "canceled"; reason: "user" }
  | { status: "interrupted"; reason: "app_shutdown" };

/**
 * Typed events the engine emits. Store adapters translate these into reducer
 * actions — the engine must not depend on reducer tuple shapes.
 */
export type AssistantEvent =
  | { type: "runStarted"; conversationId: string; run: RunStartSnapshot }
  | { type: "runChunk"; conversationId: string; runId: string; chunk: RunChunk }
  | { type: "runTerminated"; conversationId: string; runId: string; outcome: RunOutcome };
