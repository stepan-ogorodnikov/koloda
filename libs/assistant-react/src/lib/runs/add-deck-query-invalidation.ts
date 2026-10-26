import { ASSISTANT_TOOL_SPECS } from "@koloda/ai";
import type { AssistantEvent } from "@koloda/assistant";
import { conversationsAtom } from "../state/conversation-store";
import type { RunToolCall } from "../state/conversation-types";
import { isReasoningActivity } from "../state/conversation-types";
import type { AssistantJotaiStore } from "./assistant-engine-instance";

// WHY: engine emit runs outside React. The app shell registers the QueryClient
// callback here and clears it on unmount — never an escaped Effect Event.
let invalidateAddDeckQueries: (() => void) | null = null;

export function registerAddDeckQueryInvalidator(invalidate: () => void): () => void {
  invalidateAddDeckQueries = invalidate;
  return () => {
    if (invalidateAddDeckQueries === invalidate) invalidateAddDeckQueries = null;
  };
}

export function resetAddDeckQueryInvalidatorForTests(): void {
  invalidateAddDeckQueries = null;
}

// WHY: the tool-result chunk has no name, and an unmatched callId is a reducer
// no-op. Invalidate only after `add_deck` is recorded as success — a result
// that never landed must not refresh deck caches. The write itself happens in
// the host binder, which has no QueryClient (Electron runs it in main).
export function notifyAddDeckWritten(store: AssistantJotaiStore, event: AssistantEvent): void {
  if (event.type !== "runChunk") return;
  const { chunk, conversationId, runId } = event;
  if (chunk.kind !== "toolResult" || chunk.error !== undefined) return;
  const run = store.get(conversationsAtom)[conversationId]?.runs[runId];
  const call = run?.toolCalls.find(
    (entry): entry is RunToolCall => !isReasoningActivity(entry) && entry.id === chunk.callId,
  );
  if (call?.name !== ASSISTANT_TOOL_SPECS.add_deck.name || call.status !== "success") return;
  invalidateAddDeckQueries?.();
}

// WHY: a run can end while add_deck is still writing. The binder checks the
// abort signal only before the host call, and the runtime drops the result
// after an abort, so the deck may exist with no recorded success. Read the run
// before the terminal event marks the call failed.
// INVARIANT: the refetch must land after the write. Web ends the run only once
// the host call settles (the AI SDK waits for it), so the deck is written by then.
// Desktop ends the run at once, but add_deck skips its write once main sees the
// cancel, so only a write main already queued remains, and the addon's single
// worker thread orders the refetch behind it.
export function notifyAddDeckStillRunning(store: AssistantJotaiStore, event: AssistantEvent): void {
  if (event.type !== "runTerminated") return;
  const run = store.get(conversationsAtom)[event.conversationId]?.runs[event.runId];
  const isAddDeckRunning = run?.toolCalls.some(
    (entry) =>
      !isReasoningActivity(entry) && entry.name === ASSISTANT_TOOL_SPECS.add_deck.name && entry.status === "running",
  );
  if (isAddDeckRunning) invalidateAddDeckQueries?.();
}
