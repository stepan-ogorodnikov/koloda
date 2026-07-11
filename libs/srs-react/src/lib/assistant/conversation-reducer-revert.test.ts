import { describe, expect, it } from "vitest";
import { conversationReducer, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerState } from "./conversation-reducer";
import { act } from "./conversation-reducer.fixtures";

// WHY: See ASSISTANT-CHAT-MESSAGES.md §Reverting the Conversation.
// Revert is now a visual overlay (setRevertState) backed by an explicit
// commit step (commitRevert) that performs the actual deletion on the
// next generate.

describe("conversationReducer → setRevertState", () => {
  it("is a no-op when the new revert state equals the current one", () => {
    const revertState = { revertedToUserMessageId: "user-r1", preRevertInputText: "old" };
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      revertState,
    };
    const next = conversationReducer(state, act({ type: "setRevertState", revertState }));
    expect(next).toBe(state);
  });

  it("sets the revert state without removing any messages or runs", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Reply 1" }],
        },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        {
          id: "assistant-r2",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r2" },
          parts: [{ type: "text", text: "Reply 2" }],
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 1,
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 1,
        },
      },
    };
    const next = conversationReducer(
      state,
      act({
        type: "setRevertState",
        revertState: { revertedToUserMessageId: "user-r2", preRevertInputText: "draft" },
      }),
    );
    // WHY: Visual revert only — data is untouched.
    expect(next.messages).toBe(state.messages);
    expect(next.runs).toBe(state.runs);
    expect(next.activeRunId).toBe(state.activeRunId);
    expect(next.revertState).toEqual({ revertedToUserMessageId: "user-r2", preRevertInputText: "draft" });
  });

  it("clears the revert state when given null", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 1,
        },
      },
      revertState: { revertedToUserMessageId: "user-r1", preRevertInputText: "draft" },
    };
    const next = conversationReducer(state, act({ type: "setRevertState", revertState: null }));
    expect(next.revertState).toBeNull();
    // WHY: Restore is purely visual — messages and runs are intact.
    expect(next.messages).toBe(state.messages);
    expect(next.runs).toBe(state.runs);
  });
});

// WHY: Reverting to a different user message is a state overwrite, not
// a deletion. The data layer keeps all messages and runs intact; only
// the revert point moves.
describe("conversationReducer → re-revert (setRevertState over an existing revert)", () => {
  it("updates the revert point without deleting anything", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Reply 1" }],
        },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        {
          id: "assistant-r2",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r2" },
          parts: [{ type: "text", text: "Reply 2" }],
        },
        { id: "user-r3", role: "user", parts: [{ type: "text", text: "Third" }] },
        {
          id: "assistant-r3",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r3" },
          parts: [{ type: "text", text: "Reply 3" }],
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 1,
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 1,
        },
        r3: {
          id: "r3",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 1,
        },
      },
      revertState: { revertedToUserMessageId: "user-r3", preRevertInputText: "draft-3" },
    };
    const next = conversationReducer(
      state,
      act({
        type: "setRevertState",
        revertState: { revertedToUserMessageId: "user-r2", preRevertInputText: "draft-2" },
      }),
    );
    expect(next.revertState).toEqual({ revertedToUserMessageId: "user-r2", preRevertInputText: "draft-2" });
    expect(next.messages).toBe(state.messages);
    expect(Object.keys(next.runs).sort()).toEqual(["r1", "r2", "r3"]);
  });
});

// WHY: commitRevert is the only step that actually deletes hidden
// messages and runs. It is fired when the user submits a new prompt
// while the conversation is in a reverted state. See
// ASSISTANT-CHAT-MESSAGES.md §Reverting the Conversation.
describe("conversationReducer → commitRevert", () => {
  function chatRun(runId: string, status: "streaming" | "success" | "failed" | "canceled" = "success") {
    return {
      id: runId,
      mode: "chat" as const,
      status,
      cards: [],
      cardStatuses: {},
      templateFields: null,
      startedAt: new Date("2026-07-01T12:00:00Z"),
      elapsedSeconds: status === "streaming" ? null : 1,
    };
  }

  it("is a no-op when no revert state is set", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      runs: { r1: chatRun("r1") },
      revertState: null,
    };

    const next = conversationReducer(state, act({ type: "commitRevert" }));
    expect(next).toBe(state);
  });

  it("deletes messages after the revert point and removes orphaned runs", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Reply 1" }],
        },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        {
          id: "assistant-r2",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r2" },
          parts: [{ type: "text", text: "Reply 2" }],
        },
        { id: "user-r3", role: "user", parts: [{ type: "text", text: "Third" }] },
        {
          id: "assistant-r3",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r3" },
          parts: [{ type: "text", text: "Reply 3" }],
        },
      ],
      runs: {
        r1: chatRun("r1"),
        r2: chatRun("r2"),
        r3: chatRun("r3"),
      },
      revertState: { revertedToUserMessageId: "user-r2", preRevertInputText: "" },
    };

    const next = conversationReducer(state, act({ type: "commitRevert" }));

    expect(next.messages).toEqual([
      { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
      {
        id: "assistant-r1",
        role: "assistant",
        metadata: { kind: "chat-text", runId: "r1" },
        parts: [{ type: "text", text: "Reply 1" }],
      },
    ]);
    expect(Object.keys(next.runs)).toEqual(["r1"]);
    expect(next.revertState).toBeNull();
    expect(next.activeRunId).toBeNull();
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("clears lastReadRunId when it points to a dropped run", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Reply 1" }],
        },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        {
          id: "assistant-r2",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r2" },
          parts: [{ type: "text", text: "Reply 2" }],
        },
      ],
      runs: {
        r1: chatRun("r1"),
        r2: chatRun("r2"),
      },
      lastReadRunId: "r2",
      revertState: { revertedToUserMessageId: "user-r2", preRevertInputText: "" },
    };

    const next = conversationReducer(state, act({ type: "commitRevert" }));

    expect(next.lastReadRunId).toBeNull();
    expect(Object.keys(next.runs)).toEqual(["r1"]);
  });

  it("preserves lastReadRunId when it points to a surviving run", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Reply 1" }],
        },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        {
          id: "assistant-r2",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r2" },
          parts: [{ type: "text", text: "Reply 2" }],
        },
      ],
      runs: {
        r1: chatRun("r1"),
        r2: chatRun("r2"),
      },
      lastReadRunId: "r1",
      revertState: { revertedToUserMessageId: "user-r2", preRevertInputText: "" },
    };

    const next = conversationReducer(state, act({ type: "commitRevert" }));

    expect(next.lastReadRunId).toBe("r1");
    expect(Object.keys(next.runs)).toEqual(["r1"]);
  });

  it("clears dismissedRunErrorId", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          metadata: { kind: "chat-text", runId: "r1" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      runs: { r1: chatRun("r1") },
      dismissedRunErrorId: "r1",
      revertState: { revertedToUserMessageId: "user-r1", preRevertInputText: "" },
    };

    const next = conversationReducer(state, act({ type: "commitRevert" }));

    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("handles a stale revert state (target message was already removed)", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      runs: {},
      revertState: { revertedToUserMessageId: "user-nonexistent", preRevertInputText: "" },
    };

    const next = conversationReducer(state, act({ type: "commitRevert" }));

    // WHY: Stale revert state should be cleared, messages untouched.
    expect(next.revertState).toBeNull();
    expect(next.messages).toBe(state.messages);
  });
});
