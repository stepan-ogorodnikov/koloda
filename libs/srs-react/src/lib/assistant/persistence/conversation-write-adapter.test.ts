import type { Conversation, SetConversationData } from "@koloda/app";
import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { makeConversation } from "../state/assistant-conversation.fixtures";
import { conversationsAtom, upsertConversationAtom } from "../state/conversation-store";
import { buildWriteConversation } from "./conversation-write-adapter";

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
});
