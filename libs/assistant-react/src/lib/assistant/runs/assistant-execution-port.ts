import type { ChatStreamRequest } from "@koloda/ai";
import type { AssistantExecutionPort } from "@koloda/assistant";
import { logAssistantStructured } from "@koloda/assistant";
import { aiRuntimeAtom } from "@koloda/core-react";
import type { AssistantJotaiStore } from "./assistant-engine-instance";

function createStreamRequestId(): string {
  return crypto.randomUUID();
}

function logStreamStart(conversationId: string, runId: string, requestId: string): void {
  // WHY: One correlation id per stream, minted at the host/AIRuntime boundary
  // so Electron IPC and structured logs share the same requestId. Never log
  // chunks, cards, message bodies, or profile secrets.
  logAssistantStructured({ conversationId, runId, requestId, commandOrEvent: "streamStart" });
}

export function createAssistantExecutionPort(store: AssistantJotaiStore): AssistantExecutionPort {
  return {
    executeChat: (input, onChunk, onToolEvent, signal) => {
      const requestId = createStreamRequestId();
      logStreamStart(input.conversationId, input.runId, requestId);
      // WHY: request callbacks (`onToolEvent` / `executeTool`) are functions —
      // they do not survive structuredClone. Pick the serializable fields, then
      // re-attach the engine-level tool callback; hosts bind `executeTool` themselves.
      const request = structuredClone({
        messages: input.request.messages,
        input: input.request.input,
        systemPromptTemplate: input.request.systemPromptTemplate,
        tools: input.request.tools,
      }) as ChatStreamRequest;
      return store.get(aiRuntimeAtom).chat(
        input.identity.profileId,
        // WHY: attach only when the run lists tools — a tool-less request
        // stays identical to the pre-tool path.
        request.tools?.length ? { ...request, onToolEvent } : request,
        onChunk,
        signal,
        requestId,
      );
    },
  };
}
