import type { AIChatMode } from "@koloda/ai";

/**
 * Tracks the latest armed runId per stream mode so `onComplete` can clear
 * only a matching entry (a stale stream's cleanup must not clobber a newer
 * stream's arm).
 */
export type PendingRunRefs = {
  arm: (mode: AIChatMode, runId: string) => void;
  onComplete: (mode: AIChatMode, runId: string) => void;
};

export function createPendingRunRefs(): PendingRunRefs {
  let chatRunId: string | null = null;
  let cardRunId: string | null = null;

  return {
    arm(mode, runId) {
      if (mode === "chat") chatRunId = runId;
      else cardRunId = runId;
    },
    onComplete(mode, runId) {
      if (mode === "chat" && chatRunId === runId) chatRunId = null;
      if (mode === "cards" && cardRunId === runId) cardRunId = null;
    },
  };
}
