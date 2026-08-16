import type { AIChatMode, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { AssistantExecutionIdentity, ImmutableExecutionValue } from "./assistant-execution-port";
import type { CardGenerationStreamRequest } from "./card-generation";

/**
 * Typed commands the application layer may send into {@link AssistantEngine}.
 * Conversation ownership is always explicit — never inferred from UI-current state.
 */
export type SubmitInput = ImmutableExecutionValue<
  | {
      kind: "chat";
      runId: string;
      execution: AssistantExecutionIdentity;
      request: ChatStreamRequest;
    }
  | {
      kind: "cards";
      runId: string;
      execution: AssistantExecutionIdentity;
      request: CardGenerationStreamRequest;
    }
>;

/**
 * Data access snapshot replayed by retry: the context text sent with the
 * request plus its manifest. Opaque to the engine — carried to the
 * `runStarted` event untouched; the store adapter owns the manifest type.
 */
export type RunDataAccessSnapshot = {
  context: string;
  manifest: unknown;
};

export type RetryInput = ImmutableExecutionValue<{
  runId: string;
  execution: AssistantExecutionIdentity;
  request: ChatStreamRequest | CardGenerationStreamRequest;
  templateFields: TemplateFields | null;
  mode: AIChatMode;
  modelName?: string;
  dataAccess?: RunDataAccessSnapshot;
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

/** Snapshot carried on retry restart — identity, mode, and replayed data access; full run records stay in the store. */
export type RunStartSnapshot = {
  runId: string;
  mode: AIChatMode;
  templateFields: TemplateFields | null;
  modelName?: string;
  dataAccess?: RunDataAccessSnapshot;
};

export type RunChunk =
  | { kind: "assistantText"; text: string }
  | { kind: "card"; card: GeneratedCard }
  | { kind: "usage"; usage: StreamUsage };

export type RunOutcome =
  | { status: "success" }
  | { status: "failed"; error: { message: string } }
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
