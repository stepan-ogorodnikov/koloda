import type { AIChatMode } from "@koloda/ai";

/**
 * Narrow session ops the chat UI depends on.
 * Assembled in `useAssistantSession`; stream/orchestration wiring stays private.
 */
export type RunController = {
  submit: (value?: string) => Promise<void>;
  retry: (runId: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  revert: (userMessageId: string, currentInputText: string) => string | null;
  restore: () => string | null;
  dismissGenerate: () => void;
  setMode: (mode: AIChatMode) => void;
};
