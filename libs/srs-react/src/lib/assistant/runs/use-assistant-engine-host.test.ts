import { IDLE_SAVE_DEBOUNCE_MS } from "@koloda/assistant";
import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialConversationState } from "../state/conversation-reducer";
import type { ConversationReducerState } from "../state/conversation-reducer";
import {
  conversationsAtom,
  pendingSaveByConversationAtom,
  touchConversationAtom,
  upsertConversationAtom,
} from "../state/conversation-store";
import {
  deleteAssistantConversation,
  ensureAssistantEngine,
  ensureAssistantPersistenceHost,
  isAssistantPersistenceWriteAdapterReady,
  registerAssistantPersistenceWriteAdapter,
  resetAssistantEngineForTests,
} from "./use-assistant-engine-host";

function makeConversation(id: string, overrides: Partial<ConversationReducerState> = {}): ConversationReducerState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
      },
    ],
    ...overrides,
  };
}

describe("deleteAssistantConversation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAssistantEngineForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAssistantEngineForTests();
  });

  it("failed delete rolls back so edit → autosave → later delete succeed", async () => {
    const store = createStore();
    const writes: string[] = [];
    store.set(upsertConversationAtom, makeConversation("A"));

    ensureAssistantEngine(store);
    const host = ensureAssistantPersistenceHost(store);
    // WHY: mirror production write gating — no store row means no durable write
    // (removeConversationAtom clears the row after a successful delete).
    registerAssistantPersistenceWriteAdapter({
      writeConversation: async (id) => {
        if (host.isTombstoned(id)) return false;
        if (!store.get(conversationsAtom)[id]) return false;
        writes.push(id);
        return true;
      },
    });

    // Seed a queue and confirm autosave works before delete.
    store.set(touchConversationAtom, "A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual(["A"]);
    writes.length = 0;

    const invalidateConversations = vi.fn();
    const removeConversationQuery = vi.fn();

    await expect(
      deleteAssistantConversation({
        store,
        conversationId: "A",
        deleteFromDb: async () => {
          throw new Error("db delete failed");
        },
        invalidateConversations,
        removeConversationQuery,
      }),
    ).rejects.toThrow("db delete failed");

    // INVARIANT: failure must not dispose/remove or leave a permanent tombstone.
    expect(host.isTombstoned("A")).toBe(false);
    expect(store.get(conversationsAtom)["A"]).toBeDefined();
    expect(invalidateConversations).not.toHaveBeenCalled();
    expect(removeConversationQuery).not.toHaveBeenCalled();

    // Edit → autosave resumes after rollback.
    store.set(touchConversationAtom, "A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual(["A"]);
    writes.length = 0;

    await deleteAssistantConversation({
      store,
      conversationId: "A",
      deleteFromDb: async () => undefined,
      invalidateConversations,
      removeConversationQuery,
    });

    expect(store.get(conversationsAtom)["A"]).toBeUndefined();
    expect(invalidateConversations).toHaveBeenCalledTimes(1);
    expect(removeConversationQuery).toHaveBeenCalledWith("A");

    // WHY: removeConversationAtom drops the pending counter, which clears the
    // host tombstone — durable writes still no-op because the store row is gone.
    store.set(pendingSaveByConversationAtom, { A: 99 });
    host.retrySave("A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual([]);
  });
});

describe("registerAssistantPersistenceWriteAdapter", () => {
  beforeEach(() => {
    resetAssistantEngineForTests();
  });

  afterEach(() => {
    resetAssistantEngineForTests();
  });

  it("exposes readiness and unregisters only the current token", () => {
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);

    const adapterA = { writeConversation: async () => true };
    const adapterB = { writeConversation: async () => true };
    const unregisterA = registerAssistantPersistenceWriteAdapter(adapterA);
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    const unregisterB = registerAssistantPersistenceWriteAdapter(adapterB);
    unregisterA();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(true);

    unregisterB();
    expect(isAssistantPersistenceWriteAdapterReady()).toBe(false);
  });

  it("abandoned render token cannot clear a later committed registration", () => {
    const adapterA = { writeConversation: async () => false };
    const adapterB = { writeConversation: async () => true };

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
        if (!store.get(conversationsAtom)[id]) return false;
        writes.push(id);
        return true;
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
