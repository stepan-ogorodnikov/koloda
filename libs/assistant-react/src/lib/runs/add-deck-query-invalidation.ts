import { ASSISTANT_TOOL_SPECS } from "@koloda/ai";
import type { AssistantEvent } from "@koloda/assistant";
import { queryKeys } from "@koloda/core-react";
import type { QueryClient } from "@tanstack/react-query";
import { conversationsAtom } from "../state/conversation-store";
import { isReasoningActivity } from "../state/conversation-types";
import type { AssistantJotaiStore } from "./assistant-engine-instance";

// WHY: engine emit runs outside React. The app shell registers the QueryClient
// callback here and clears it on unmount — never an escaped Effect Event.
let invalidateAddDeckQueries: (() => void) | null = null;

export function invalidateDeckQueriesAfterAddDeck(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.decks.all() });
  queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all({}) });
  // WHY: deck usage counts feed the delete guards on presets and templates.
  queryClient.invalidateQueries({ queryKey: queryKeys.algorithms.decksAll() });
  queryClient.invalidateQueries({ queryKey: queryKeys.templates.decksAll() });
}

/**
 * Register the app-shell cache refresh for a successful `add_deck`.
 * Returns an unregister that clears the slot only if this registration is current.
 */
export function registerAddDeckQueryInvalidator(invalidate: () => void): () => void {
  invalidateAddDeckQueries = invalidate;
  return () => {
    if (invalidateAddDeckQueries === invalidate) invalidateAddDeckQueries = null;
  };
}

/** Tests only: drop a leaked invalidator registration. */
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
  const call = run?.toolCalls?.find((entry) => !isReasoningActivity(entry) && entry.id === chunk.callId);
  if (call?.name !== ASSISTANT_TOOL_SPECS.add_deck.name || call.status !== "success") return;
  invalidateAddDeckQueries?.();
}
