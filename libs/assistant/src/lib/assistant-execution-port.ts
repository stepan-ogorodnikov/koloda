import type { CardGenerationFields, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "./card-generation";

/** Recursively read-only data safe to retain across an asynchronous execution queue. */
export type ImmutableExecutionValue<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TValue)[]
    ? readonly ImmutableExecutionValue<TValue>[]
    : T extends object
      ? { readonly [TKey in keyof T]: ImmutableExecutionValue<T[TKey]> }
      : T;

/**
 * The non-secret template data needed to execute card generation.
 * Credentials and provider secrets must never be added to this snapshot.
 */
export type AssistantTemplateSnapshot = ImmutableExecutionValue<{
  id: number;
  content: {
    fields: CardGenerationFields;
  };
}>;

/**
 * Non-secret identity captured when an assistant command is accepted.
 * The profile identifies host-owned configuration; the host resolves any
 * credentials for that profile only when the execution port is invoked.
 */
export type AssistantExecutionIdentity = ImmutableExecutionValue<{
  profileId: string;
  template?: AssistantTemplateSnapshot;
}>;

export type AssistantChatExecutionInput = ImmutableExecutionValue<{
  kind: "chat";
  conversationId: string;
  runId: string;
  identity: AssistantExecutionIdentity;
  request: ChatStreamRequest;
}>;

export type AssistantGenerateExecutionInput = ImmutableExecutionValue<{
  kind: "cards";
  conversationId: string;
  runId: string;
  identity: AssistantExecutionIdentity;
  request: CardGenerationStreamRequest;
}>;

/**
 * Application-scoped provider boundary. Implementations may resolve host-owned
 * secrets from `identity.profileId` at call time, but must not return or persist
 * those secrets in assistant commands, renderer state, or logs.
 */
export type AssistantExecutionPort = {
  executeChat: (
    input: AssistantChatExecutionInput,
    onChunk: (chunk: string) => void,
    signal: AbortSignal,
  ) => Promise<StreamUsage | undefined>;
  executeGenerate: (
    input: AssistantGenerateExecutionInput,
    onCard: (card: GeneratedCard) => void,
    signal: AbortSignal,
  ) => Promise<void>;
};
