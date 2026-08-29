import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { assistantContextUsageAtom } from "./conversation-selectors";
import {
  assistantConversationStateAtom,
  currentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import { initialConversationState } from "./conversation-reducer";
import type { StreamUsage } from "@koloda/ai";

const usageA: StreamUsage = { promptTokens: 100, completionTokens: 10, totalTokens: 110 };
const usageB: StreamUsage = { promptTokens: 200, completionTokens: 20, totalTokens: 220 };

function createStoreWithConversation() {
  const store = createStore();
  store.set(upsertConversationAtom, { ...initialConversationState, id: "A", createdAt: new Date(1) });
  store.set(currentConversationIdAtom, "A");
  return store;
}

function dispatch(store: ReturnType<typeof createStore>, action: Parameters<typeof store.set>[1]) {
  store.set(assistantConversationStateAtom, action);
}

describe("assistantContextUsageAtom", () => {
  it("returns null when no run carries usage", () => {
    const store = createStoreWithConversation();
    dispatch(store, ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]);

    expect(store.get(assistantContextUsageAtom)).toBeNull();
  });

  it("returns the latest run's usage instead of summing across runs", () => {
    const store = createStoreWithConversation();
    dispatch(store, ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]);
    dispatch(store, ["setUsage", { runId: "r1", usage: usageA }]);
    dispatch(store, ["completeRun", { runId: "r1" }]);
    dispatch(store, ["submitTurn", { runId: "r2", text: "again", kind: "chat-text", assistantText: "" }]);
    dispatch(store, ["setUsage", { runId: "r2", usage: usageB }]);

    // WHY: each run's prompt already includes the full history, so the sum
    // would double-count against the context window; only the latest counts.
    expect(store.get(assistantContextUsageAtom)).toBe(usageB);
  });

  it("falls back to the latest run that has usage when the newest run has none yet", () => {
    const store = createStoreWithConversation();
    dispatch(store, ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]);
    dispatch(store, ["setUsage", { runId: "r1", usage: usageA }]);
    dispatch(store, ["completeRun", { runId: "r1" }]);
    dispatch(store, ["submitTurn", { runId: "r2", text: "again", kind: "chat-text", assistantText: "" }]);

    expect(store.get(assistantContextUsageAtom)).toBe(usageA);
  });
});
