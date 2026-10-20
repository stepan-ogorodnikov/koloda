import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeConversation } from "../state/assistant-conversation.fixtures";
import { conversationsAtom, touchConversationAtom, upsertConversationAtom } from "../state/conversation-store";
import { ensureAssistantEngine } from "./assistant-engine-instance";
import {
  ensureAssistantPersistenceHost,
  isAssistantPersistenceWriteAdapterReady,
  registerAssistantPersistenceWriteAdapter,
  resetAssistantEngineForTests,
} from "./assistant-persistence-host";

// WHY: The idle save delay inside @koloda/assistant, which keeps it off its entry.
const IDLE_SAVE_DEBOUNCE_MS = 250;

describe("registerAssistantPersistenceWriteAdapter", () => {
  beforeEach(() => {
    resetAssistantEngineForTests();
  });

  afterEach(() => {
    resetAssistantEngineForTests();
  });

  it("exposes readiness and unregisters only the current token", () => {
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);

    const adapterA = { writeConversation: async () => {} };
    const adapterB = { writeConversation: async () => {} };
    const unregisterA = registerAssistantPersistenceWriteAdapter(adapterA);
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    const unregisterB = registerAssistantPersistenceWriteAdapter(adapterB);
    unregisterA();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    unregisterB();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);
  });

  it("abandoned render token cannot clear a later committed registration", () => {
    const adapterA = { writeConversation: async () => {} };
    const adapterB = { writeConversation: async () => {} };

    const unregisterAbandoned = registerAssistantPersistenceWriteAdapter(adapterA);
    const unregisterCommitted = registerAssistantPersistenceWriteAdapter(adapterB);

    unregisterAbandoned();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    unregisterCommitted();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);
  });

  it("rejects durable writes until the adapter is ready", async () => {
    const store = createStore();
    const writes: string[] = [];
    ensureAssistantEngine(store);
    const host = ensureAssistantPersistenceHost(store);

    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(touchConversationAtom, "A");

    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual([]);

    registerAssistantPersistenceWriteAdapter({
      writeConversation: async (id) => {
        if (!store.get(conversationsAtom)[id]) return;
        writes.push(id);
      },
    });

    host.retrySave("A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual(["A"]);
    vi.useRealTimers();
  });
});
