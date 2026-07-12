import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import { createTestDb } from "../test/test-helpers";
import { getConversation, getConversations, setConversation } from "./conversations";

describe("conversations repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("returns null for a missing conversation", async () => {
    const { db } = testDb;
    const result = await getConversation(db, "nonexistent-id");
    expect(result).toBeNull();
  });

  it("round-trips a conversation through save and get", async () => {
    const { db } = testDb;
    const createdAt = new Date(1700000000000);
    const state = {
      id: "conv-1",
      createdAt,
      messages: [{ id: "msg-1", role: "user", content: "hello" }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    const saved = await setConversation(db, { id: "conv-1", state });
    expect(saved.id).toBe("conv-1");
    // The state column is jsonb, so Date instances are serialized to ISO strings.
    expect(saved.state).toEqual({ ...state, createdAt: createdAt.toISOString() });
    expect(saved.createdAt).toBeInstanceOf(Date);

    const loaded = await getConversation(db, "conv-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("conv-1");
    expect(loaded!.state).toEqual({ ...state, createdAt: createdAt.toISOString() });
  });

  it("updates an existing conversation on conflict", async () => {
    const { db } = testDb;
    const createdAt = new Date(1700000000000);
    const stateV1 = {
      id: "conv-1",
      createdAt,
      messages: [],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };
    const stateV2 = {
      id: "conv-1",
      createdAt,
      messages: [{ id: "msg-1", role: "user", content: "hi" }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    await setConversation(db, { id: "conv-1", state: stateV1 });
    const updated = await setConversation(db, { id: "conv-1", state: stateV2 });

    expect(updated.state).toEqual({ ...stateV2, createdAt: createdAt.toISOString() });
    expect(updated.updatedAt).not.toBeNull();

    const loaded = await getConversation(db, "conv-1");
    expect(loaded!.state).toEqual({ ...stateV2, createdAt: createdAt.toISOString() });
  });

  it("preserves the provided updatedAt on subsequent saves", async () => {
    const { db } = testDb;
    const id = "conv-pinned";
    const state = {
      id,
      createdAt: new Date(1700000000000),
      messages: [],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };
    const pinned = new Date(1650000000000);

    await setConversation(db, { id, state, updatedAt: pinned });
    const reloaded = await getConversation(db, id);
    expect(reloaded!.updatedAt).toEqual(pinned);

    // A follow-up save that explicitly passes the same timestamp must not
    // advance it. This guards against model/profile/parameter changes silently
    // bumping the sidebar order.
    const after = await setConversation(db, { id, state, updatedAt: pinned });
    expect(after.updatedAt).toEqual(pinned);
  });

  it("falls back to CURRENT_TIMESTAMP when updatedAt is omitted", async () => {
    const { db } = testDb;
    const id = "conv-default";
    const state = {
      id,
      createdAt: new Date(1700000000000),
      messages: [],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    const before = Date.now();
    const saved = await setConversation(db, { id, state });
    const after = Date.now();

    expect(saved.updatedAt).not.toBeNull();
    const ts = saved.updatedAt!.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("lists conversations ordered by updated/created time", async () => {
    const { db } = testDb;
    const createdAt = new Date(1700000000000);
    const state = {
      id: "",
      createdAt,
      messages: [],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    await setConversation(db, { id: "conv-a", state: { ...state, id: "conv-a" } });
    await setConversation(db, { id: "conv-b", state: { ...state, id: "conv-b" } });
    // Ensure both rows have a non-null updated_at so ordering is deterministic,
    // then make conv-a the most recently updated.
    await setConversation(db, { id: "conv-b", state: { ...state, id: "conv-b", mode: "chat" } });
    await setConversation(db, { id: "conv-a", state: { ...state, id: "conv-a", mode: "cards" } });

    const list = await getConversations(db);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("conv-a");
    expect(list[1].id).toBe("conv-b");
  });

  it("handles complex nested state", async () => {
    const { db } = testDb;
    const createdAt = new Date(1700000000000);
    const startedAt = new Date(1700000000000);
    const state = {
      id: "conv-complex",
      createdAt,
      messages: [
        { id: "msg-1", role: "user", content: "Generate cards about animals" },
        { id: "msg-2", role: "assistant", content: "Here are some cards" },
      ],
      runs: {
        "run-1": {
          id: "run-1",
          mode: "cards",
          status: "completed",
          cards: [
            { front: "Cat", back: "A small domesticated feline" },
            { front: "Dog", back: "A domesticated canine" },
          ],
          cardStatuses: { 0: "success", 1: "success" },
          templateFields: [
            { id: 1, title: "Front", type: "text", isRequired: true },
            {
              id: 2,
              title: "Back",
              type: "text",
              isRequired: true,
            },
          ],
          startedAt,
          elapsedSeconds: 5,
        },
      },
      activeRunId: "run-1",
      mode: "cards",
      deckId: 1,
    };

    const saved = await setConversation(db, { id: "conv-complex", state });
    expect(saved.state).toEqual({
      ...state,
      createdAt: createdAt.toISOString(),
      runs: {
        "run-1": { ...state.runs["run-1"], startedAt: startedAt.toISOString() },
      },
    });

    const loaded = await getConversation(db, "conv-complex");
    expect(loaded!.state).toEqual({
      ...state,
      createdAt: createdAt.toISOString(),
      runs: {
        "run-1": { ...state.runs["run-1"], startedAt: startedAt.toISOString() },
      },
    });
  });

  it("persists and round-trips an explicit title", async () => {
    const { db } = testDb;
    const state = {
      id: "conv-titled",
      createdAt: new Date(1700000000000),
      messages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "anything" }] }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    const saved = await setConversation(db, { id: "conv-titled", state, title: "My custom title" });
    expect(saved.title).toBe("My custom title");

    const loaded = await getConversation(db, "conv-titled");
    expect(loaded!.title).toBe("My custom title");
  });

  it("overwrites a previous title on subsequent saves", async () => {
    const { db } = testDb;
    const state = {
      id: "conv-rename",
      createdAt: new Date(1700000000000),
      messages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "anything" }] }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    await setConversation(db, { id: "conv-rename", state, title: "Old title" });
    const updated = await setConversation(db, { id: "conv-rename", state, title: "New title" });
    expect(updated.title).toBe("New title");

    const loaded = await getConversation(db, "conv-rename");
    expect(loaded!.title).toBe("New title");
  });

  it("stores null when title is omitted", async () => {
    const { db } = testDb;
    const state = {
      id: "conv-untitled",
      createdAt: new Date(1700000000000),
      messages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "anything" }] }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    const saved = await setConversation(db, { id: "conv-untitled", state });
    expect(saved.title).toBeNull();

    const loaded = await getConversation(db, "conv-untitled");
    expect(loaded!.title).toBeNull();
  });

  it("getConversations returns list items without the state column", async () => {
    const { db } = testDb;
    const state = {
      id: "conv-list",
      createdAt: new Date(1700000000000),
      messages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "anything" }] }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    await setConversation(db, { id: "conv-list", state, title: "Sidebar title" });

    const list = await getConversations(db);
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item.id).toBe("conv-list");
    expect(item.title).toBe("Sidebar title");
    expect(item.createdAt).toBeInstanceOf(Date);
    // The list projection must not ship `state`.
    expect("state" in item).toBe(false);
  });

  it("preserves null titles through a null-stored list query", async () => {
    const { db } = testDb;
    const state = {
      id: "conv-null-title",
      createdAt: new Date(1700000000000),
      messages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "anything" }] }],
      runs: {},
      activeRunId: null,
      mode: "chat",
      deckId: null,
    };

    await setConversation(db, { id: "conv-null-title", state });

    const list = await getConversations(db);
    expect(list[0].title).toBeNull();
  });
});
