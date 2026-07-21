import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  assistantConversationStateAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import { assistantMessagesAtom } from "./conversation-selectors";
import { dispatchTo, makeConversation } from "./assistant-conversation.fixtures";
import type { GenerationRun } from "./conversation-reducer";

describe("revert state in-memory lifecycle", () => {
  function chatRun(runId: string): GenerationRun {
    return {
      id: runId,
      mode: "chat",
      status: "success",
      cards: [],
      cardStatuses: {},
      templateFields: null,
      startedAt: new Date(1),
      elapsedSeconds: 1,
    };
  }

  it("setRevertState does not bump updatedAt and is not persisted", () => {
    const store = createStore();
    const messages = [
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      { id: "user-r2", role: "user" as const, parts: [{ type: "text" as const, text: "Bye" }] },
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
    dispatchTo(store, "A", ["startRun", { runId: "r99", mode: "chat", request: {} }]);
    const seeded = store.get(assistantConversationStateAtom);
    expect(seeded.updatedAt).not.toBeNull();
    const seededAt = seeded.updatedAt!.getTime();

    // Small delay so a real "now()" would be measurably newer.
    const beforeDispatch = Date.now();
    while (Date.now() === beforeDispatch) {
      // spin until the clock advances past `beforeDispatch`.
    }

    dispatchTo(store, "A", ["setRevertState", { revertedToUserMessageId: "user-r2", preRevertInputText: "draft" }]);

    const after = store.get(assistantConversationStateAtom);
    expect(after.revertState).toEqual({
      revertedToUserMessageId: "user-r2",
      preRevertInputText: "draft",
    });
    expect(after.updatedAt!.getTime()).toBe(seededAt);
  });

  it("assistantMessagesAtom hides messages from the revert point onward", () => {
    const store = createStore();
    const messages = [
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      { id: "user-r2", role: "user" as const, parts: [{ type: "text" as const, text: "Bye" }] },
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
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      { id: "user-r2", role: "user" as const, parts: [{ type: "text" as const, text: "Bye" }] },
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
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      {
        id: "assistant-r1",
        role: "assistant" as const,
        metadata: { kind: "chat-text" as const, runId: "r1" },
        parts: [{ type: "text" as const, text: "Hello" }],
      },
      { id: "user-r2", role: "user" as const, parts: [{ type: "text" as const, text: "Bye" }] },
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
