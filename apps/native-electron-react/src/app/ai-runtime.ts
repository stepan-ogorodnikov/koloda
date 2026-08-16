import type { AIRuntime, CardGenerationRequest, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import { AIError, isAIError } from "@koloda/ai";
import { isAppError } from "@koloda/app";
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

// WHY: `invoke` throws AppError whose `.message` is the code (details live on
// `.details`). Assistant UI stores `error.message`, so convert to AIError here.
function toRuntimeError(error: unknown): AIError {
  if (isAIError(error)) return error;
  if (isAppError(error)) {
    return new AIError(error.code, error.details || error.message);
  }
  if (error instanceof Error) {
    return new AIError("unknown", error.message || error.name);
  }
  return new AIError("unknown", String(error));
}

type WaitForStreamOptions = {
  requestId: string;
  abortSignal: AbortSignal;
  onChunk?: (chunk: string) => void;
  onCard?: (card: GeneratedCard) => void;
};

type StreamWaiter = {
  promise: Promise<StreamUsage | undefined>;
  /** Detach listeners without settling — caller must throw/reject instead. */
  dispose: () => void;
};

function waitForStream({ requestId, abortSignal, onChunk, onCard }: WaitForStreamOptions): StreamWaiter {
  let isSettled = false;
  let unsubscribe = () => {};
  let removeAbortListener = () => {};

  const cleanup = () => {
    unsubscribe();
    removeAbortListener();
  };

  const settle = (fn: () => void) => {
    if (isSettled) return;
    isSettled = true;
    cleanup();
    fn();
  };

  const promise = new Promise<StreamUsage | undefined>((resolve, reject) => {
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
            // WHY: Prefer provider/IPC failure over a racing abort so auth/network
            // errors are not turned into silent cancelRun.
            if (event.code === "aborted") {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            reject(new AIError(event.code, event.message || event.code));
          });
          return;
      }
    };

    const onAbort = () => {
      void invoke("cmd_ai_abort", { requestId }).catch(() => {});
      settle(() => reject(new DOMException("Aborted", "AbortError")));
    };

    unsubscribe = window.electronAPI.on(AI_STREAM_CHANNEL, onEvent);

    if (abortSignal.aborted) {
      onAbort();
      return;
    }

    abortSignal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => abortSignal.removeEventListener("abort", onAbort);
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
    listModels: async (profileId) => {
      try {
        return await invoke("cmd_ai_list_models", { profileId });
      } catch (error) {
        throw toRuntimeError(error);
      }
    },

    chat: async (profileId, request: ChatStreamRequest, onChunk, abortSignal, correlationId) => {
      // WHY: Prefer the host-minted id so structured streamStart logs match IPC.
      const requestId = correlationId ?? crypto.randomUUID();
      // INVARIANT: Attach the stream listener before invoke so early chunks/errors are not missed.
      const waiter = waitForStream({ requestId, abortSignal, onChunk });
      // WHY: Abort before start would leave an orphan provider stream if we still invoke.
      if (abortSignal.aborted) {
        return waiter.promise;
      }
      try {
        await invoke("cmd_ai_chat_stream", { requestId, profileId, request });
      } catch (error) {
        // WHY: Dispose (don't reject) — throwing below is the single rejection path.
        waiter.dispose();
        throw toRuntimeError(error);
      }
      // WHY: Abort during start may miss main's AbortController; re-abort after invoke binds.
      if (abortSignal.aborted) {
        void invoke("cmd_ai_abort", { requestId }).catch(() => {});
      }
      return waiter.promise;
    },

    generateCards: async (profileId, request: CardGenerationRequest, correlationId) => {
      // WHY: Prefer the host-minted id so structured streamStart logs match IPC.
      const requestId = correlationId ?? crypto.randomUUID();
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
            dataContext: request.dataContext,
          },
        });
      } catch (error) {
        // WHY: Dispose (don't reject) — throwing below is the single rejection path.
        waiter.dispose();
        throw toRuntimeError(error);
      }
      // WHY: Abort during start may miss main's AbortController; re-abort after invoke binds.
      if (abortSignal.aborted) {
        void invoke("cmd_ai_abort", { requestId }).catch(() => {});
      }
      await waiter.promise;
    },
  };
}
