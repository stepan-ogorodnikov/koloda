import { describe, expect, it, vi } from "vitest";
import { conversationReducer, initialConversationState } from "./conversation-state";

function reduce(actions: Parameters<typeof conversationReducer>[1][]) {
  return actions.reduce(
    (state, action) => conversationReducer(state, action),
    initialConversationState,
  );
}

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
        startedAt: 1000,
        elapsedSeconds: null,
      });

      vi.useRealTimers();
    });
  });

  describe("addCard", () => {
    it("adds a card to the run's cards array", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "cards", request: {} }]);
      state = conversationReducer(state, {
        type: "addCard",
        runId: "r1",
        card: { content: { "1": { text: "Front" } } },
      });
      expect(state.runs["r1"].cards).toHaveLength(1);
      expect(state.runs["r1"].cards[0].content["1"].text).toBe("Front");
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
    it("resets run status to streaming, clears cards, and sets activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([
        { type: "startRun", runId: "r1", mode: "cards", request: {} },
        { type: "addCard", runId: "r1", card: { content: {} } },
      ]);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      vi.setSystemTime(10_000);
      state = conversationReducer(state, { type: "restartRun", runId: "r1" });

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].cards).toEqual([]);
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

  describe("reset", () => {
    it("returns the initial state", () => {
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "chat", request: {} },
      ]);
      state = conversationReducer(state, { type: "reset" });
      expect(state).toEqual(initialConversationState);
    });
  });

  describe("unknown action", () => {
    it("returns the current state unchanged", () => {
      const state = conversationReducer(initialConversationState, {
        type: "nonexistent" as any,
      });
      expect(state).toBe(initialConversationState);
    });
  });
});
