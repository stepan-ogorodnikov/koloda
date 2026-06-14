import { describe, expect, it, vi } from "vitest";
import {
  conversationReducer,
  initialConversationState,
  isConversationState,
  normalizeRestoredConversation,
} from "./conversation-state";
import type { ConversationState } from "./conversation-state";

function reduce(actions: Parameters<typeof conversationReducer>[1][]) {
  return actions.reduce(
    (state, action) => conversationReducer(state, action),
    initialConversationState,
  );
}

describe("isConversationState", () => {
  it("accepts a valid conversation shape", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: 1,
    };
    expect(isConversationState(state)).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isConversationState(null)).toBe(false);
    expect(isConversationState("string")).toBe(false);
    expect(isConversationState(123)).toBe(false);
  });

  it("rejects objects with wrong field types", () => {
    expect(isConversationState({ ...initialConversationState, id: 123 })).toBe(false);
    expect(isConversationState({ ...initialConversationState, mode: "voice" })).toBe(false);
    expect(isConversationState({ ...initialConversationState, deckId: "5" })).toBe(false);
  });
});

describe("normalizeRestoredConversation", () => {
  it("forces streaming runs to failed with an interrupted error", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);

    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: 5000,
          elapsedSeconds: null,
        },
      },
    };

    const next = normalizeRestoredConversation(state);

    expect(next.runs["r1"]).toMatchObject({
      status: "failed",
      error: "interrupted",
      elapsedSeconds: 5,
    });
    expect(next.activeRunId).toBeNull();

    vi.useRealTimers();
  });

  it("leaves non-streaming runs unchanged", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: 1000,
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state);

    expect(next).toBe(state);
  });
});

describe("conversationReducer", () => {
  describe("addUserMessage", () => {
    it("appends a user message to the messages array", () => {
      const state = reduce([{ type: "addUserMessage", runId: "r1", text: "Hello" }]);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("user");
      expect(state.messages[0].id).toBe("user-r1");
    });
  });

  describe("addAssistantMessage", () => {
    it("appends an assistant message with chat-text metadata", () => {
      const state = reduce([
        { type: "addAssistantMessage", runId: "r1", kind: "chat-text", text: "Hi there" },
      ]);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("assistant");
      expect(state.messages[0].id).toBe("assistant-r1");
    });
  });

  describe("updateAssistantText", () => {
    it("updates the text of the matching assistant message in-place", () => {
      let state = reduce([
        { type: "addAssistantMessage", runId: "r1", kind: "chat-text", text: "..." },
      ]);
      state = conversationReducer(state, {
        type: "updateAssistantText",
        runId: "r1",
        text: "Done",
      });
      expect(state.messages[0].parts).toEqual([{ type: "text", text: "Done" }]);
    });

    it("does nothing when no message matches the runId", () => {
      const state = conversationReducer(initialConversationState, {
        type: "updateAssistantText",
        runId: "missing",
        text: "Nope",
      });
      expect(state.messages).toEqual([]);
    });
  });

  describe("startRun", () => {
    it("creates a new run with streaming status and sets activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const state = conversationReducer(initialConversationState, {
        type: "startRun",
        runId: "r1",
        mode: "chat",
        request: { prompt: "test" },
      });

      expect(state.activeRunId).toBe("r1");
      expect(state.runs["r1"]).toMatchObject({
        id: "r1",
        mode: "chat",
        status: "streaming",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: 1000,
        elapsedSeconds: null,
      });

      vi.useRealTimers();
    });

    it("stamps templateFields for cards runs when provided", () => {
      const fields = [{ id: 1, title: "Front", type: "text" as const, isRequired: true }];

      const state = conversationReducer(initialConversationState, {
        type: "startRun",
        runId: "r1",
        mode: "cards",
        request: {},
        templateFields: fields,
      });

      expect(state.runs["r1"].templateFields).toEqual(fields);
    });
  });

  describe("addCard", () => {
    it("adds a card to the run's cards array and seeds idle status", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "cards", request: {} }]);
      state = conversationReducer(state, {
        type: "addCard",
        runId: "r1",
        card: { content: { "1": { text: "Front" } } },
      });
      expect(state.runs["r1"].cards).toHaveLength(1);
      expect(state.runs["r1"].cards[0].content["1"].text).toBe("Front");
      expect(state.runs["r1"].cardStatuses).toEqual({ 0: "idle" });
    });
  });

  describe("completeRun", () => {
    it("sets status to success, computes elapsedSeconds, and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);

      vi.setSystemTime(5000);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      expect(state.runs["r1"].status).toBe("success");
      expect(state.runs["r1"].elapsedSeconds).toBe(5);
      expect(state.activeRunId).toBeNull();

      vi.useRealTimers();
    });

    it("does not clear activeRunId when a different run completes", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "chat", request: {} },
        { type: "startRun", runId: "r2", mode: "chat", request: {} },
      ]);
      expect(state.activeRunId).toBe("r2");

      state = conversationReducer(state, { type: "completeRun", runId: "r1" });
      expect(state.runs["r1"].status).toBe("success");
      expect(state.activeRunId).toBe("r2");
    });
  });

  describe("failRun", () => {
    it("sets status to failed and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);

      vi.setSystemTime(2000);
      state = conversationReducer(state, { type: "failRun", runId: "r1" });

      expect(state.runs["r1"].status).toBe("failed");
      expect(state.runs["r1"].elapsedSeconds).toBe(2);
      expect(state.activeRunId).toBeNull();

      vi.useRealTimers();
    });
  });

  describe("cancelRun", () => {
    it("sets status to canceled and clears activeRunId", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);
      state = conversationReducer(state, { type: "cancelRun", runId: "r1" });

      expect(state.runs["r1"].status).toBe("canceled");
      expect(state.activeRunId).toBeNull();
    });
  });

  describe("restartRun", () => {
    it("resets run status to streaming, clears cards and statuses, and sets activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([
        {
          type: "startRun",
          runId: "r1",
          mode: "cards",
          request: {},
          templateFields: [{ id: 1, title: "Front", type: "text" as const, isRequired: true }],
        },
        { type: "addCard", runId: "r1", card: { content: {} } },
      ]);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      vi.setSystemTime(10_000);
      state = conversationReducer(state, { type: "restartRun", runId: "r1" });

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].cardStatuses).toEqual({});
      expect(state.runs["r1"].templateFields).toBeNull();
      expect(state.runs["r1"].startedAt).toBe(10_000);
      expect(state.runs["r1"].elapsedSeconds).toBeNull();
      expect(state.runs["r1"].usage).toBeUndefined();
      expect(state.activeRunId).toBe("r1");

      vi.useRealTimers();
    });

    it("is a no-op when run does not exist", () => {
      const state = conversationReducer(initialConversationState, {
        type: "restartRun",
        runId: "missing",
      });
      expect(state.runs).toEqual({});
    });
  });

  describe("setUsage", () => {
    it("sets usage on the specified run", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);
      const usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
      state = conversationReducer(state, { type: "setUsage", runId: "r1", usage });
      expect(state.runs["r1"].usage).toEqual(usage);
    });
  });

  describe("setMode", () => {
    it("changes the conversation mode", () => {
      const state = conversationReducer(initialConversationState, {
        type: "setMode",
        mode: "cards",
      });
      expect(state.mode).toBe("cards");
    });
  });

  describe("setDeck", () => {
    it("sets the deck when the conversation is not locked", () => {
      const state = conversationReducer(initialConversationState, {
        type: "setDeck",
        deckId: 5,
      });
      expect(state.deckId).toBe(5);
    });

    it("is a no-op when a user message exists", () => {
      let state = reduce([{ type: "addUserMessage", runId: "r1", text: "Hi" }]);
      state = conversationReducer(state, { type: "setDeck", deckId: 5 });
      expect(state.deckId).toBeNull();
    });
  });

  describe("setCardStatus", () => {
    it("updates the status of a card by index", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "cards", request: {} },
        { type: "addCard", runId: "r1", card: { content: {} } },
      ]);
      state = conversationReducer(state, { type: "setCardStatus", runId: "r1", index: 0, status: "success" });
      expect(state.runs["r1"].cardStatuses).toEqual({ 0: "success" });
    });
  });

  describe("newConversation", () => {
    it("resets to a fresh conversation with the provided id and createdAt", () => {
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "chat", request: {} },
        { type: "setDeck", deckId: 3 },
      ]);
      state = conversationReducer(state, { type: "newConversation", id: "new-id", createdAt: 1234 });

      expect(state).toEqual({
        id: "new-id",
        createdAt: 1234,
        messages: [],
        runs: {},
        activeRunId: null,
        mode: "chat",
        deckId: null,
      });
    });
  });

  describe("unknown action", () => {
    it("returns the current state unchanged", () => {
      const state = conversationReducer(
        initialConversationState,
        {
          type: "nonexistent",
        } as unknown as Parameters<typeof conversationReducer>[1],
      );
      expect(state).toBe(initialConversationState);
    });
  });
});
