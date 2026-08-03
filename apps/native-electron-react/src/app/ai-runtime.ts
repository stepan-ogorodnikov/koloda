import type { AIRuntime, CardGenerationRequest, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import { AIError } from "@koloda/ai";
import { invoke } from "./electron";

export const AI_STREAM_CHANNEL = "ai:stream";

export type AiStreamEvent =
  | { requestId: string; type: "chunk"; chunk: string }
  | { requestId: string; type: "card"; card: GeneratedCard }
  | { requestId: string; type: "done"; usage?: StreamUsage }
  | { requestId: string; type: "error"; code: string; message: string };

function isAiStreamEvent(value: unknown): value is AiStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AiStreamEvent>;
  return typeof event.requestId === "string" && typeof event.type === "string";
}

type WaitForStreamOptions = {
  requestId: string;
  abortSignal: AbortSignal;
  onChunk?: (chunk: string) => void;
  onCard?: (card: GeneratedCard) => void;
};

type StreamWaiter = {
  promise: Promise<StreamUsage | undefined>;
  dispose: () => void;
};

function waitForStream({ requestId, abortSignal, onChunk, onCard }: WaitForStreamOptions): StreamWaiter {
  let isSettled = false;
  let unsubscribe = () => {};
  let cleanup = () => {};

  const promise = new Promise<StreamUsage | undefined>((resolve, reject) => {
    const settle = (fn: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      fn();
    };

    const onEvent = (...args: unknown[]) => {
      const event = args[0];
      if (!isAiStreamEvent(event) || event.requestId !== requestId) return;

      switch (event.type) {
        case "chunk":
          onChunk?.(event.chunk);
          return;
        case "card":
          onCard?.(event.card);
          return;
        case "done":
          settle(() => resolve(event.usage));
          return;
        case "error":
          settle(() => {
            if (event.code === "aborted" || abortSignal.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            reject(new AIError(event.code, event.message));
          });
          return;
      }
    };

    const onAbort = () => {
      void invoke("cmd_ai_abort", { requestId }).catch(() => {});
      settle(() => reject(new DOMException("Aborted", "AbortError")));
    };

    unsubscribe = window.electronAPI.on(AI_STREAM_CHANNEL, onEvent);
    cleanup = () => {
      unsubscribe();
      abortSignal.removeEventListener("abort", onAbort);
    };

    if (abortSignal.aborted) {
      onAbort();
      return;
    }

    abortSignal.addEventListener("abort", onAbort, { once: true });
  });

  return {
    promise,
    dispose: () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
    },
  };
}

// INVARIANT: Renderer adapter — profileId only; secrets stay in main via NAPI.
export function createElectronAIRuntime(): AIRuntime {
  return {
    listModels: (profileId) => invoke("cmd_ai_list_models", { profileId }),

    chat: async (profileId, request: ChatStreamRequest, onChunk, abortSignal) => {
      const requestId = crypto.randomUUID();
      // INVARIANT: Attach the stream listener before invoke so early chunks/errors are not missed.
      const waiter = waitForStream({ requestId, abortSignal, onChunk });
      // WHY: Abort before start would leave an orphan provider stream if we still invoke.
      if (abortSignal.aborted) {
        return waiter.promise;
      }
      try {
        await invoke("cmd_ai_chat_stream", { requestId, profileId, request });
      } catch (error) {
        waiter.dispose();
        throw error;
      }
      // WHY: Abort during start may miss main's AbortController; re-abort after invoke binds.
      if (abortSignal.aborted) {
        void invoke("cmd_ai_abort", { requestId }).catch(() => {});
      }
      return waiter.promise;
    },

    generateCards: async (profileId, request: CardGenerationRequest) => {
      const requestId = crypto.randomUUID();
      const abortSignal = request.abortSignal ?? new AbortController().signal;
      // INVARIANT: Attach the stream listener before invoke so early cards/errors are not missed.
      const waiter = waitForStream({ requestId, abortSignal, onCard: request.onCard });
      // WHY: Abort before start would leave an orphan provider stream if we still invoke.
      if (abortSignal.aborted) {
        await waiter.promise;
        return;
      }
      try {
        // WHY: Callbacks / AbortSignal are not IPC-serializable — recreate them in main.
        await invoke("cmd_ai_generate_cards", {
          requestId,
          profileId,
          request: {
            template: request.template,
            input: request.input,
            messages: request.messages,
            systemPromptTemplate: request.systemPromptTemplate,
          },
        });
      } catch (error) {
        waiter.dispose();
        throw error;
      }
      // WHY: Abort during start may miss main's AbortController; re-abort after invoke binds.
      if (abortSignal.aborted) {
        void invoke("cmd_ai_abort", { requestId }).catch(() => {});
      }
      await waiter.promise;
    },
  };
}
