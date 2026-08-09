import type { AIChatMode, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { CardGenerationStreamRequest } from "./card-generation";

/**
 * Typed commands the application layer may send into {@link AssistantEngine}.
 * Conversation ownership is always explicit — never inferred from UI-current state.
 */
export type ExecuteChatInput = {
  runId: string;
  request: ChatStreamRequest;
};

export type ExecuteGenerateInput = {
  runId: string;
  request: CardGenerationStreamRequest;
};

export type RetryInput = {
  runId: string;
  request: ChatStreamRequest | CardGenerationStreamRequest;
  templateFields: TemplateFields | null;
  mode: AIChatMode;
  modelName?: string;
};

export type AssistantCommand =
  | { type: "executeChat"; conversationId: string; input: ExecuteChatInput }
  | { type: "executeGenerate"; conversationId: string; input: ExecuteGenerateInput }
  | { type: "retry"; conversationId: string; input: RetryInput }
  | { type: "cancel"; conversationId: string; runId: string };

/** Snapshot carried on retry restart — identity + mode only; full run records stay in the store. */
export type RunStartSnapshot = {
  runId: string;
  mode: AIChatMode;
  templateFields: TemplateFields | null;
  modelName?: string;
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
