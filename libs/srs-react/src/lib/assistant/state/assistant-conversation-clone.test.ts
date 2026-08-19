import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  pendingSaveAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import { assistantHasContextAtom, unreadConversationIdsAtom } from "./conversation-selectors";
import { cloneConversationAtom } from "./conversation-actions";
import { makeConversation, makeRun } from "./assistant-conversation.fixtures";
import type { ConversationReducerState } from "./conversation-reducer";

describe("cloneConversationAtom", () => {
  it("creates a new conversation with a fresh id and switches the current id to it", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user",
            parts: [{ type: "text", text: "Hello" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" });

    expect(newId).toBeTypeOf("string");
    expect(newId).not.toBe("A");
    expect(store.get(conversationsAtom)[newId!]).toBeDefined();
    expect(store.get(assistantConversationStateAtom).id).toBe(newId);
  });

  it("preserves the source conversation unchanged", () => {
    const store = createStore();
    const source: ConversationReducerState = makeConversation("A", {
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "Hi there" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
      ],
      runs: { r1: makeRun("r1", "success") },
      lastReadRunId: "r1",
    });
    store.set(upsertConversationAtom, source);
    store.set(setCurrentConversationIdAtom, "A");

    store.set(cloneConversationAtom, { sourceId: "A" });

    // Source state is byte-for-byte identical (clone must not touch it).
    expect(store.get(conversationsAtom)["A"]).toEqual(source);
  });

  it("copies all messages from the source into the clone", () => {
    const store = createStore();
    const messages = [
      {
        id: "user-r1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hello" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
      },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Hi" }],
        metadata: { kind: "chat-text", runId: "r1" },
      },
      {
        id: "user-r2",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "How are you?" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
      },
      {
        id: "assistant-r2",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Good" }],
        metadata: { kind: "chat-text", runId: "r2" },
      },
    ];
    store.set(upsertConversationAtom, makeConversation("A", { messages }));
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    expect(clone.messages).toEqual(messages);
  });

  it("copies completed runs (success, failed, canceled, interrupted) into the clone", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q1" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
          {
            id: "assistant-r1",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A1" }],
            metadata: { kind: "chat-text", runId: "r1" },
          },
          {
            id: "user-r2",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q2" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
          },
          {
            id: "assistant-r2",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A2" }],
            metadata: { kind: "chat-text", runId: "r2" },
          },
          {
            id: "user-r3",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q3" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r3" },
          },
          {
            id: "assistant-r3",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A3" }],
            metadata: { kind: "chat-text", runId: "r3" },
          },
          {
            id: "user-r4",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q4" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r4" },
          },
          {
            id: "assistant-r4",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A4" }],
            metadata: { kind: "chat-text", runId: "r4" },
          },
        ],
        runs: {
          r1: makeRun("r1", "success"),
          r2: makeRun("r2", "failed"),
          r3: makeRun("r3", "canceled"),
          r4: makeRun("r4", "interrupted"),
        },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    expect(Object.keys(clone.runs).sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(clone.runs.r1.status).toBe("success");
    expect(clone.runs.r2.status).toBe("failed");
    expect(clone.runs.r3.status).toBe("canceled");
    expect(clone.runs.r4.status).toBe("interrupted");
  });

  it("drops streaming runs and their messages from the clone", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q1" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
          {
            id: "assistant-r1",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A1" }],
            metadata: { kind: "chat-text", runId: "r1" },
          },
          {
            id: "user-r2",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q2" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
          },
          {
            id: "assistant-r2",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "mid-stream" }],
            metadata: { kind: "chat-text", runId: "r2" },
          },
          {
            id: "user-r3",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q3" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r3" },
          },
          {
            id: "assistant-r3",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A3" }],
            metadata: { kind: "chat-text", runId: "r3" },
          },
        ],
        runs: {
          r1: makeRun("r1", "success"),
          r2: makeRun("r2", "streaming"),
          r3: makeRun("r3", "success"),
        },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    // r2 is dropped; r1 and r3 are kept.
    expect(Object.keys(clone.runs).sort()).toEqual(["r1", "r3"]);
    // The user-r2 / assistant-r2 pair is dropped.
    expect(clone.messages).toHaveLength(4);
    expect(clone.messages.map((m) => m.id)).toEqual(["user-r1", "assistant-r1", "user-r3", "assistant-r3"]);
  });

  it("copies AI profile state from the source", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        profileId: "p1",
        modelId: "m1",
        modelParameters: { reasoning_effort: "high" },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    expect(clone.profileId).toBe("p1");
    expect(clone.modelId).toBe("m1");
    expect(clone.modelParameters).toEqual({ reasoning_effort: "high" });
    expect(clone).not.toHaveProperty("deckId");
    expect(clone).not.toHaveProperty("mode");
  });

  it("clears activeRunId so the clone has no in-flight run", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
          {
            id: "assistant-r1",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A" }],
            metadata: { kind: "chat-text", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "streaming") },
        activeRunId: "r1",
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    // Even if the source has an active run, the clone is idle.
    expect(clone.activeRunId).toBeNull();
  });

  it("sets lastReadRunId to the latest cloned run id, so the clone starts as read", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q1" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
          {
            id: "assistant-r1",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A1" }],
            metadata: { kind: "chat-text", runId: "r1" },
          },
          {
            id: "user-r2",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q2" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
          },
          {
            id: "assistant-r2",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "A2" }],
            metadata: { kind: "chat-text", runId: "r2" },
          },
        ],
        runs: {
          r1: makeRun("r1", "success"),
          r2: makeRun("r2", "success"),
        },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    expect(clone.lastReadRunId).toBe("r2");
    // Unread indicator must stay hidden.
    store.set(setCurrentConversationIdAtom, newId);
    expect(store.get(unreadConversationIdsAtom).has(newId)).toBe(false);
  });

  it("sets updatedAt to null so the clone sorts by createdAt until the user touches it", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "success") },
        updatedAt: new Date(1000),
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    expect(clone.updatedAt).toBeNull();
  });

  it("bumps the new conversation's pending-save counter so the clone is persisted on restore", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "success") },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;

    // The pending-save counter for the new id is bumped, so
    // useConversationPersistence fires its flush.
    expect(store.get(pendingSaveAtom)).toBeGreaterThan(0);
    // Switch to the new id and confirm the counter is the bumped one.
    store.set(setCurrentConversationIdAtom, newId);
    expect(store.get(pendingSaveAtom)).toBeGreaterThan(0);
  });

  it("does not bump the source conversation's pending-save counter", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "success") },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");
    const before = store.get(pendingSaveAtom);

    store.set(cloneConversationAtom, { sourceId: "A" });
    // Switch back to A — its counter is unchanged.
    const stateA = store.get(conversationsAtom)["A"];
    void stateA;
    // Pending-save count for A is unchanged (it was 0 before the clone,
    // and switching back to A reads from the A counter).
    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(pendingSaveAtom)).toBe(before);
  });

  it("returns null when the source conversation is unknown", () => {
    const store = createStore();
    const newId = store.set(cloneConversationAtom, { sourceId: "missing" });
    expect(newId).toBeNull();
  });

  it("produces a clone that is recognized as having context (clone button stays enabled)", () => {
    // WHY: The CloneConversationButton is disabled when the source
    // conversation is empty. The clone must be eligible for further
    // interaction immediately, including being cloned again.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "success") },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    store.set(setCurrentConversationIdAtom, newId);

    expect(store.get(assistantHasContextAtom)).toBe(true);
  });

  it("the source's active-run state is preserved (background stream continues)", () => {
    // WHY: Cloning must not affect the source. A streaming run on the
    // source must keep streaming after the user has cloned.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
          {
            id: "assistant-r1",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "streaming" }],
            metadata: { kind: "chat-text", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "streaming") },
        activeRunId: "r1",
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    store.set(cloneConversationAtom, { sourceId: "A" });

    // Source still has the streaming run.
    const stateA = store.get(conversationsAtom)["A"];
    expect(stateA.activeRunId).toBe("r1");
    expect(stateA.runs.r1.status).toBe("streaming");
  });

  it("resets dismissed run error state in the clone", () => {
    // WHY: The user hasn't viewed the clone yet, so a previously
    // dismissed error banner should be shown again.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          {
            id: "user-r1",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Q" }],
            metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
          },
        ],
        runs: { r1: makeRun("r1", "success") },
        dismissedRunErrorId: "r1",
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    const newId = store.set(cloneConversationAtom, { sourceId: "A" })!;
    const clone = store.get(conversationsAtom)[newId];

    expect(clone.dismissedRunErrorId).toBeNull();
  });
});
