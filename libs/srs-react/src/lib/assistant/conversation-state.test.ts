import { describe, expect, it, vi } from "vitest";
import {
  coerceConversationState,
  conversationReducer,
  initialConversationState,
  normalizeRestoredConversation,
} from "./conversation-state";
import type { ConversationState } from "./conversation-state";

function reduce(actions: Parameters<typeof conversationReducer>[1][]) {
  return actions.reduce(
    (state, action) => conversationReducer(state, action),
    initialConversationState,
  );
}

describe("coerceConversationState", () => {
  it("accepts a valid conversation shape with Date timestamps", () => {
    const state = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
    };
    expect(coerceConversationState(state)).not.toBeNull();
  });

  it("rejects non-objects", () => {
    expect(coerceConversationState(null)).toBeNull();
    expect(coerceConversationState("string")).toBeNull();
    expect(coerceConversationState(123)).toBeNull();
  });

  it("rejects objects with wrong field types", () => {
    expect(coerceConversationState({ ...initialConversationState, id: 123 })).toBeNull();
    expect(coerceConversationState({ ...initialConversationState, mode: "voice" })).toBeNull();
    expect(coerceConversationState({ ...initialConversationState, deckId: "5" })).toBeNull();
  });

  it("coerces ISO string createdAt into a Date", () => {
    const iso = "2024-01-01T00:00:00.000Z";
    const coerced = coerceConversationState({
      ...initialConversationState,
      id: "conv-1",
      createdAt: iso,
    });
    expect(coerced).not.toBeNull();
    expect(coerced!.createdAt).toBeInstanceOf(Date);
    expect(coerced!.createdAt.toISOString()).toBe(iso);
  });

  it("coerces number createdAt into a Date", () => {
    const coerced = coerceConversationState({
      ...initialConversationState,
      id: "conv-1",
      createdAt: 1700000000000,
    });
    expect(coerced).not.toBeNull();
    expect(coerced!.createdAt).toBeInstanceOf(Date);
    expect(coerced!.createdAt.getTime()).toBe(1700000000000);
  });

  it("accepts legacy rows that pre-date new fields", () => {
    const coerced = coerceConversationState({ ...initialConversationState, id: "conv-1", createdAt: new Date(1) });
    expect(coerced).not.toBeNull();
  });
});

describe("normalizeRestoredConversation", () => {
  it("removes streaming runs and their messages", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: "r1",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        { id: "assistant-r1", role: "assistant", parts: [{ type: "text", text: "" }] },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(5000),
          elapsedSeconds: null,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({});
    expect(next.messages).toEqual([]);
    expect(next.activeRunId).toBeNull();
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("removes failed runs and their messages", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r1",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        { id: "assistant-r1", role: "assistant", parts: [{ type: "text", text: "" }] },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          error: { message: "Network error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 2,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({});
    expect(next.messages).toEqual([]);
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("leaves successful runs unchanged and preserves their messages", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: null,
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        { id: "assistant-r1", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state);

    expect(next).toBeNull();
  });

  it("resets pending card statuses to idle while preserving success and error", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      runs: {
        r1: {
          id: "r1",
          mode: "cards",
          status: "success",
          cards: [
            { content: { "1": { text: "A" } } },
            { content: { "1": { text: "B" } } },
            { content: { "1": { text: "C" } } },
            { content: { "1": { text: "D" } } },
          ],
          cardStatuses: { 0: "pending", 1: "success", 2: "error", 3: "idle" },
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"].cardStatuses).toEqual({
      0: "idle",
      1: "success",
      2: "error",
      3: "idle",
    });
    expect(next.runs["r1"].status).toBe("success");
  });

  it("removes only failed runs and keeps successful ones alongside their messages", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: null,
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", parts: [{ type: "text", text: "Response 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", parts: [{ type: "text", text: "" }] },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 3,
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "failed",
          error: { message: "Network error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(2000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({ r1: state.runs["r1"] });
    expect(next.messages).toEqual([
      { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
      { id: "assistant-r1", role: "assistant", parts: [{ type: "text", text: "Response 1" }] },
    ]);
    expect(next.activeRunId).toBeNull();
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("clears dismissedRunErrorId when all runs are removed", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          error: { message: "Timeout" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({});
    expect(next.dismissedRunErrorId).toBeNull();
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
        startedAt: new Date(1000),
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
      expect(state.runs["r1"].error).toBeUndefined();
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

  describe("runFailed", () => {
    it("sets status to failed, stores error, computes elapsed time, and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);

      vi.setSystemTime(3000);
      state = conversationReducer(state, {
        type: "runFailed",
        runId: "r1",
        error: { message: "Network error" },
      });

      expect(state.runs["r1"].status).toBe("failed");
      expect(state.runs["r1"].error).toEqual({ message: "Network error" });
      expect(state.runs["r1"].elapsedSeconds).toBe(3);
      expect(state.activeRunId).toBeNull();

      vi.useRealTimers();
    });

    it("does not clear activeRunId when a different run fails", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "chat", request: {} },
        { type: "startRun", runId: "r2", mode: "chat", request: {} },
      ]);
      expect(state.activeRunId).toBe("r2");

      state = conversationReducer(state, {
        type: "runFailed",
        runId: "r1",
        error: { message: "Other error" },
      });
      expect(state.runs["r1"].status).toBe("failed");
      expect(state.activeRunId).toBe("r2");
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
      state = conversationReducer(state, {
        type: "restartRun",
        runId: "r1",
        request: { updated: true },
        templateFields: null,
      });

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].cardStatuses).toEqual({});
      expect(state.runs["r1"].request).toEqual({ updated: true });
      expect(state.runs["r1"].templateFields).toBeNull();
      expect(state.runs["r1"].startedAt).toEqual(new Date(10_000));
      expect(state.runs["r1"].elapsedSeconds).toBeNull();
      expect(state.runs["r1"].usage).toBeUndefined();
      expect(state.runs["r1"].error).toBeUndefined();
      expect(state.activeRunId).toBe("r1");

      vi.useRealTimers();
    });

    it("is a no-op when run does not exist", () => {
      const state = conversationReducer(initialConversationState, {
        type: "restartRun",
        runId: "missing",
        request: {},
        templateFields: null,
      });
      expect(state.runs).toEqual({});
    });

    it("updates request and templateFields on retry", () => {
      let state = reduce([
        {
          type: "startRun",
          runId: "r1",
          mode: "cards",
          request: {},
          templateFields: [{ id: 1, title: "Front", type: "text" as const, isRequired: true }],
        },
      ]);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      const nextFields = [{ id: 2, title: "Back", type: "text" as const, isRequired: false }];
      state = conversationReducer(state, {
        type: "restartRun",
        runId: "r1",
        request: { updated: true },
        templateFields: nextFields,
      });

      expect(state.runs["r1"].request).toEqual({ updated: true });
      expect(state.runs["r1"].templateFields).toEqual(nextFields);
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

    it("is allowed after a user message but before any successful generated-cards run", () => {
      let state = reduce([{ type: "addUserMessage", runId: "r1", text: "Hi" }]);
      state = conversationReducer(state, { type: "setDeck", deckId: 5 });
      expect(state.deckId).toBe(5);
    });

    it("is a no-op when a generated-cards run has completed successfully", () => {
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "cards", request: {} },
        { type: "addAssistantMessage", runId: "r1", kind: "generated-cards", text: "" },
      ]);
      state = conversationReducer(state, { type: "setDeck", deckId: 5 });
      expect(state.deckId).toBe(5);

      state = conversationReducer(state, { type: "completeRun", runId: "r1" });
      state = conversationReducer(state, { type: "setDeck", deckId: 9 });
      expect(state.deckId).toBe(5);
    });

    it("stays unlocked when a generated-cards run is still streaming or failed", () => {
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "cards", request: {} },
        { type: "addAssistantMessage", runId: "r1", kind: "generated-cards", text: "" },
        { type: "failRun", runId: "r1" },
      ]);
      state = conversationReducer(state, { type: "setDeck", deckId: 7 });
      expect(state.deckId).toBe(7);
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
      const createdAt = new Date(1234);
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "chat", request: {} },
        { type: "setDeck", deckId: 3 },
      ]);
      state = conversationReducer(state, { type: "newConversation", id: "new-id", createdAt });

      expect(state).toEqual({
        id: "new-id",
        createdAt,
        updatedAt: null,
        messages: [],
        runs: {},
        activeRunId: null,
        dismissedRunErrorId: null,
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
