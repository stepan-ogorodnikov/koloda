import type { AIChatMode } from "@koloda/ai";
import { useCallback, useRef } from "react";
import type { DispatchToConversation } from "./use-conversation-runs";

/**
 * Manages per-stream failure refs for routing stream errors back to the
 * originating conversation and run.
 *
 * We keep separate refs for chat and card streams (rather than a single
 * Map) because the underlying stream hooks in `@koloda/ai-react`
 * (`useChatStream` and `useAssistantCardGeneration`) are independent and
 * can each have an in-flight run on a different conversation. The error
 * callback for each hook only fires for *its* stream, so a single shared
 * ref + iterating lookup would route errors to the wrong conversation when
 * both streams are in flight.
 *
 * ## Contract
 *
 * 1. **Arm** — Call `arm(mode, conversationId, runId)` *before* starting
 *    a stream so that if the stream fails, the error lands on the right
 *    conversation.
 * 2. **Error** — The stream hook's `onError` callback should call
 *    `handleError(mode, error)`. This dispatches `runFailed` to the
 *    originating conversation and clears the ref.
 * 3. **Complete** — The stream executor's `finally` block should call
 *    `onComplete(mode, runId)`. This clears the ref *only* if the runId
 *    still matches — preventing a stale stream's cleanup from clobbering
 *    a newer stream's entry.
 */
export type UsePendingRunRefsReturn = {
  arm: (mode: AIChatMode, conversationId: string, runId: string) => void;
  handleError: (mode: AIChatMode, error: Error) => void;
  onComplete: (mode: AIChatMode, runId: string) => void;
};

export function usePendingRunRefs(dispatchToConversation: DispatchToConversation): UsePendingRunRefsReturn {
  const chatRef = useRef<{ id: string; runId: string } | null>(null);
  const cardRef = useRef<{ id: string; runId: string } | null>(null);

  const arm = useCallback((mode: AIChatMode, conversationId: string, runId: string) => {
    const ref = mode === "chat" ? chatRef : cardRef;
    ref.current = { id: conversationId, runId };
  }, []);

  const handleError = useCallback(
    (mode: AIChatMode, error: Error) => {
      const ref = mode === "chat" ? chatRef : cardRef;
      const entry = ref.current;
      if (!entry) return;
      ref.current = null;
      dispatchToConversation(entry.id, ["runFailed", { runId: entry.runId, error: { message: error.message } }]);
    },
    [dispatchToConversation],
  );

  const onComplete = useCallback((mode: AIChatMode, runId: string) => {
    const ref = mode === "chat" ? chatRef : cardRef;
    if (ref.current?.runId === runId) ref.current = null;
  }, []);

  return { arm, handleError, onComplete };
}
