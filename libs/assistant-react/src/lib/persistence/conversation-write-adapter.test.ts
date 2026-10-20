import { IDLE_SAVE_DEBOUNCE_MS } from "@koloda/assistant";
import { AppError } from "@koloda/app";
import type { Conversation, SetConversationData } from "@koloda/app";
import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAssistantEngine } from "../runs/assistant-engine-instance";
import {
  ensureAssistantPersistenceHost,
  registerAssistantPersistenceWriteAdapter,
  resetAssistantEngineForTests,
} from "../runs/assistant-persistence-host";
import { makeConversation } from "../state/assistant-conversation.fixtures";
import {
  conversationsAtom,
  currentConversationIdAtom,
  pendingSaveByConversationAtom,
  touchConversationAtom,
  upsertConversationAtom,
} from "../state/conversation-store";
import { buildWriteConversation, deleteAssistantConversation } from "./conversation-write-adapter";

function makeRow(data: SetConversationData): Conversation {
  return {
    id: data.id,
    title: data.title ?? null,
    state: data.state,
    createdAt: new Date(1),
    updatedAt: data.updatedAt ?? null,
  };
}

describe("buildWriteConversation", () => {
  it("persists a conversation that has an id and no messages or active run", async () => {
    const store = createStore();
    const createdAt = new Date(1);
    store.set(
      upsertConversationAtom,
      makeConversation("draft-1", {
        createdAt,
        updatedAt: createdAt,
        messages: [],
        activeRunId: null,
        promptInput: "  hello   world  ",
      }),
    );
    const setConversationFn = vi.fn(async (data: SetConversationData) => makeRow(data));
    const write = buildWriteConversation({
      store,
      setConversationFn,
      setSaveStatus: vi.fn(),
      setQueryConversation: vi.fn(),
      updateConversationsList: vi.fn(),
      isTombstoned: () => false,
    });

    expect(await write("draft-1")).toBe(true);
    expect(setConversationFn).toHaveBeenCalledTimes(1);
    const payload = setConversationFn.mock.calls[0]![0];
    expect(payload.id).toBe("draft-1");
    expect(payload.title).toBe("hello world");
    expect(payload.updatedAt?.getTime()).toBe(createdAt.getTime());
    expect(store.get(conversationsAtom)["draft-1"]).toBeDefined();
  });

  it("writes a wiped prompt as a null title and does not skip the row", async () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("draft-1", {
        messages: [],
        activeRunId: null,
        promptInput: "   ",
      }),
    );
    const setConversationFn = vi.fn(async (data: SetConversationData) => makeRow(data));
    const write = buildWriteConversation({
      store,
      setConversationFn,
      setSaveStatus: vi.fn(),
      setQueryConversation: vi.fn(),
      updateConversationsList: vi.fn(),
      isTombstoned: () => false,
    });

    expect(await write("draft-1")).toBe(true);
    expect(setConversationFn.mock.calls[0]![0].title).toBeNull();
  });

  it("keeps the first user message as the title when the prompt later changes", async () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        promptInput: "later draft",
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "first turn" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    const setConversationFn = vi.fn(async (data: SetConversationData) => makeRow(data));
    const write = buildWriteConversation({
      store,
      setConversationFn,
      setSaveStatus: vi.fn(),
      setQueryConversation: vi.fn(),
      updateConversationsList: vi.fn(),
      isTombstoned: () => false,
    });

    expect(await write("A")).toBe(true);
    expect(setConversationFn.mock.calls[0]![0].title).toBe("first turn");
  });

  it("passes through the state's updatedAt instead of stamping a new one", async () => {
    const store = createStore();
    const createdAt = new Date(1);
    store.set(
      upsertConversationAtom,
      makeConversation("draft-1", {
        createdAt,
        updatedAt: createdAt,
        messages: [],
        promptInput: "hello",
      }),
    );
    const setConversationFn = vi.fn(async (data: SetConversationData) => makeRow(data));
    const write = buildWriteConversation({
      store,
      setConversationFn,
      setSaveStatus: vi.fn(),
      setQueryConversation: vi.fn(),
      updateConversationsList: vi.fn(),
      isTombstoned: () => false,
    });

    await write("draft-1");
    expect(setConversationFn.mock.calls[0]![0].updatedAt?.getTime()).toBe(createdAt.getTime());
  });

  it("skips a tombstoned id without writing", async () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("draft-1", { promptInput: "hello" }));
    const setConversationFn = vi.fn(async (data: SetConversationData) => makeRow(data));
    const write = buildWriteConversation({
      store,
      setConversationFn,
      setSaveStatus: vi.fn(),
      setQueryConversation: vi.fn(),
      updateConversationsList: vi.fn(),
      isTombstoned: () => true,
    });

    expect(await write("draft-1")).toBe(false);
    expect(setConversationFn).not.toHaveBeenCalled();
  });

  it("stores the thrown Error on save failure so the chat banner can format it", async () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("draft-1", { promptInput: "hello" }));
    store.set(currentConversationIdAtom, "draft-1");
    const failure = new AppError("db.update", "SQLITE_BUSY");
    const setSaveStatus = vi.fn();
    const write = buildWriteConversation({
      store,
      setConversationFn: vi.fn(async () => {
        throw failure;
      }),
      setSaveStatus,
      setQueryConversation: vi.fn(),
      updateConversationsList: vi.fn(),
      isTombstoned: () => false,
    });

    await expect(write("draft-1")).rejects.toBe(failure);
    expect(setSaveStatus).toHaveBeenCalledWith({
      conversationId: "draft-1",
      error: failure,
      isDismissed: false,
    });
  });
});

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

    // INVARIANT: removeConversationAtom drops the pending counter and the
    // store row; the committed host tombstone stays so a late pending bump
    // cannot resurrect the conversation.
    expect(host.isTombstoned("A")).toBe(true);
    store.set(pendingSaveByConversationAtom, { A: 99 });
    host.retrySave("A");
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual([]);
    expect(host.isTombstoned("A")).toBe(true);
  });
});
