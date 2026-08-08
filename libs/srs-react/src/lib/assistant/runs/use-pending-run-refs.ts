import type { AIChatMode } from "@koloda/ai";
import { useCallback, useRef } from "react";

/**
 * Tracks the latest armed runId per stream mode so `onComplete` can clear
 * only a matching entry (a stale stream's cleanup must not clobber a newer
 * stream's arm).
 *
 * ## Contract
 *
 * 1. **Arm** — Call `arm(mode, runId)` *before* starting a stream.
 * 2. **Complete** — The stream executor's `finally` block should call
 *    `onComplete(mode, runId)`. This clears the ref *only* if the runId
 *    still matches.
 *
 * Stream failures are dispatched in `use-conversation-runs` transport
 * catch blocks with the run's closed-over ids — not via a pending-ref
 * error callback.
 */
export type UsePendingRunRefsReturn = {
  arm: (mode: AIChatMode, runId: string) => void;
  onComplete: (mode: AIChatMode, runId: string) => void;
};

export function usePendingRunRefs(): UsePendingRunRefsReturn {
  const chatRef = useRef<string | null>(null);
  const cardRef = useRef<string | null>(null);

  const arm = useCallback((mode: AIChatMode, runId: string) => {
    const ref = mode === "chat" ? chatRef : cardRef;
    ref.current = runId;
  }, []);

  const onComplete = useCallback((mode: AIChatMode, runId: string) => {
    const ref = mode === "chat" ? chatRef : cardRef;
    if (ref.current === runId) ref.current = null;
  }, []);

  return { arm, onComplete };
}
