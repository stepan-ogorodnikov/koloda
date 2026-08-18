import type { AssistantToolEvent, ChatStreamRequest, StreamUsage } from "@koloda/ai";

/** Recursively read-only data safe to retain across an asynchronous execution queue. */
export type ImmutableExecutionValue<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TValue)[]
    ? readonly ImmutableExecutionValue<TValue>[]
    : T extends object
      ? { readonly [TKey in keyof T]: ImmutableExecutionValue<T[TKey]> }
      : T;

/**
 * Non-secret identity captured when an assistant command is accepted.
 * The profile identifies host-owned configuration; the host resolves any
 * credentials for that profile only when the execution port is invoked.
 */
export type AssistantExecutionIdentity = ImmutableExecutionValue<{
  profileId: string;
}>;

export type AssistantChatExecutionInput = ImmutableExecutionValue<{
  kind: "chat";
  conversationId: string;
  runId: string;
  identity: AssistantExecutionIdentity;
  request: ChatStreamRequest;
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
    onToolEvent: (event: AssistantToolEvent) => void,
    signal: AbortSignal,
  ) => Promise<StreamUsage | undefined>;
};
