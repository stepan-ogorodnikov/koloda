import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantConversationStateAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import { assistantMessagesAtom } from "./conversation-selectors";
import { dispatchTo, makeConversation } from "./assistant-conversation.fixtures";
import type { AssistantRun } from "./conversation-reducer";

describe("revert state in-memory lifecycle", () => {
  function chatRun(runId: string): AssistantRun {
    return {
      id: runId,
      status: "success",
      cards: [],
      cardStatuses: {},
      templateFields: null,
      startedAt: new Date(1),
      elapsedSeconds: 1,
    };
  }

  // WHY: House pattern (use-assistant-engine-host.test.ts) — fake timers scoped
  // to a describe so only the updatedAt-isolation test runs on a controlled
  // clock; sibling tests keep real time. Only Date is faked: the test is fully
  // synchronous, so a narrow fake surface cannot interfere with jotai internals
  // or promise scheduling.
  describe("updatedAt isolation", () => {
    const CLOCK_STEP_MS = 1000;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("setRevertState does not bump updatedAt and is not persisted", () => {
      const store = createStore();
      const messages = [
        {
          id: "user-r1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Hi" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant" as const,
          metadata: { kind: "chat-text" as const, runId: "r1" },
          parts: [{ type: "text" as const, text: "Hello" }],
        },
        {
          id: "user-r2",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Bye" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
        },
        {
          id: "assistant-r2",
          role: "assistant" as const,
          metadata: { kind: "chat-text" as const, runId: "r2" },
          parts: [{ type: "text" as const, text: "Bye!" }],
        },
      ];
      store.set(
        upsertConversationAtom,
        makeConversation("A", { messages, runs: { r1: chatRun("r1"), r2: chatRun("r2") } }),
      );
      store.set(setCurrentConversationIdAtom, "A");

      const before = store.get(assistantConversationStateAtom);
      expect(before.revertState).toBeNull();

      // WHY: updatedAt starts as null on a freshly upserted conversation.
      // We still want to confirm that a setRevertState dispatch does not
      // stamp it with a fresh date, so we make a run-starting dispatch
      // first to seed a value, then verify revert leaves it alone.
      dispatchTo(store, "A", ["submitTurn", { runId: "r99", text: "hello", kind: "chat-text", assistantText: "" }]);
      const seeded = store.get(assistantConversationStateAtom);
      expect(seeded.updatedAt).not.toBeNull();
      const seededAt = seeded.updatedAt!.getTime();

      // WHY: The fake clock is frozen between steps, so one fixed-step advance
      // proves "now" moved measurably past the seed without a busy-wait — making
      // the unchanged-updatedAt assertion below exactly deterministic.
      vi.advanceTimersByTime(CLOCK_STEP_MS);

      dispatchTo(store, "A", ["setRevertState", { revertedToUserMessageId: "user-r2", preRevertInputText: "draft" }]);

      const after = store.get(assistantConversationStateAtom);
      expect(after.revertState).toEqual({
        revertedToUserMessageId: "user-r2",
        preRevertInputText: "draft",
      });
      expect(after.updatedAt!.getTime()).toBe(seededAt);
    });
  });

  it("assistantMessagesAtom hides messages from the revert point onward", () => {
    const store = createStore();
    const messages = [
      {
        id: "user-r1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hi" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
      },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      {
        id: "user-r2",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Bye" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
      },
      {
        id: "assistant-r2",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r2" },
        parts: [{ type: "text" as const, text: "Bye!" }],
      },
    ];
    store.set(
      upsertConversationAtom,
      makeConversation("A", { messages, runs: { r1: chatRun("r1"), r2: chatRun("r2") } }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    expect(store.get(assistantMessagesAtom).map((m) => m.id)).toEqual([
      "user-r1",
      "assistant-r1",
      "user-r2",
      "assistant-r2",
    ]);

    dispatchTo(store, "A", ["setRevertState", { revertedToUserMessageId: "user-r2", preRevertInputText: "draft" }]);

    expect(store.get(assistantMessagesAtom).map((m) => m.id)).toEqual(["user-r1", "assistant-r1"]);
    // WHY: The hidden messages are still in the conversation state so
    // that restore (or commitRevert on the next submit) sees the full
    // picture.
    expect(store.get(assistantConversationStateAtom).messages.map((m) => m.id)).toEqual([
      "user-r1",
      "assistant-r1",
      "user-r2",
      "assistant-r2",
    ]);
  });

  it("clearing the revert state restores the full visible message list", () => {
    const store = createStore();
    const messages = [
      {
        id: "user-r1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hi" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
      },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      {
        id: "user-r2",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Bye" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
      },
    ];
    store.set(upsertConversationAtom, makeConversation("A", { messages, runs: { r1: chatRun("r1") } }));
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", ["setRevertState", { revertedToUserMessageId: "user-r2", preRevertInputText: "draft" }]);
    expect(store.get(assistantMessagesAtom)).toEqual([messages[0], messages[1]]);

    dispatchTo(store, "A", ["setRevertState", null]);
    expect(store.get(assistantMessagesAtom)).toBe(messages);
    expect(store.get(assistantConversationStateAtom).messages).toBe(messages);
  });

  it("commitRevert permanently removes the hidden prefix and clears the revert state", () => {
    const store = createStore();
    const messages = [
      {
        id: "user-r1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hi" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
      },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      {
        id: "user-r2",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Bye" }],
        metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
      },
      {
        id: "assistant-r2",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r2" },
        parts: [{ type: "text" as const, text: "Bye!" }],
      },
    ];
    store.set(
      upsertConversationAtom,
      makeConversation("A", { messages, runs: { r1: chatRun("r1"), r2: chatRun("r2") } }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", ["setRevertState", { revertedToUserMessageId: "user-r2", preRevertInputText: "draft" }]);
    expect(store.get(assistantMessagesAtom).map((m) => m.id)).toEqual(["user-r1", "assistant-r1"]);

    dispatchTo(store, "A", ["commitRevert"]);

    const after = store.get(assistantConversationStateAtom);
    expect(after.messages.map((m) => m.id)).toEqual(["user-r1", "assistant-r1"]);
    expect(Object.keys(after.runs)).toEqual(["r1"]);
    expect(after.revertState).toBeNull();
    expect(store.get(assistantMessagesAtom).map((m) => m.id)).toEqual(["user-r1", "assistant-r1"]);
  });
});
