import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelStreamingRuns,
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
    expect(coerceConversationState({ ...initialConversationState, profileId: 5 })).toBeNull();
    expect(coerceConversationState({ ...initialConversationState, modelId: 7 })).toBeNull();
    expect(coerceConversationState({ ...initialConversationState, modelParameters: "x" })).toBeNull();
    expect(coerceConversationState({ ...initialConversationState, modelParameters: { reasoning_effort: 5 } }))
      .toBeNull();
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

  it("accepts rows that omit the AI configuration fields", () => {
    const coerced = coerceConversationState({ ...initialConversationState, id: "conv-1", createdAt: new Date(1) });
    expect(coerced).not.toBeNull();
  });

  it("defaults missing AI configuration fields to null and an empty map", () => {
    const coerced = coerceConversationState({
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
    })!;
    expect(coerced.profileId).toBeNull();
    expect(coerced.modelId).toBeNull();
    expect(coerced.modelParameters).toEqual({});
  });

  it("preserves stored AI profile, model, and model parameters", () => {
    const coerced = coerceConversationState({
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
      profileId: "prof-1",
      modelId: "model-1",
      modelParameters: { reasoning_effort: "high" },
    })!;
    expect(coerced.profileId).toBe("prof-1");
    expect(coerced.modelId).toBe("model-1");
    expect(coerced.modelParameters).toEqual({ reasoning_effort: "high" });
  });

  describe("lastReadRunId coercion", () => {
    it("defaults lastReadRunId to null when the field is missing", () => {
      const coerced = coerceConversationState({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
      })!;
      expect(coerced.lastReadRunId).toBeNull();
    });

    it("accepts an explicit null lastReadRunId", () => {
      const coerced = coerceConversationState({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: null,
      })!;
      expect(coerced.lastReadRunId).toBeNull();
    });

    it("preserves a string lastReadRunId", () => {
      const coerced = coerceConversationState({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: "r-42",
      })!;
      expect(coerced.lastReadRunId).toBe("r-42");
    });

    it("rejects a non-string, non-null lastReadRunId", () => {
      expect(coerceConversationState({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: 42,
      })).toBeNull();
      expect(coerceConversationState({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: true,
      })).toBeNull();
      expect(coerceConversationState({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: {},
      })).toBeNull();
    });
  });

  describe("run modelName coercion", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "chat",
        status: "success",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    it("preserves a string modelName on a run", () => {
      const coerced = coerceConversationState(
        makeStateWithRun(baseRun({ modelName: "GPT-4" })),
      )!;
      expect(coerced.runs["r1"].modelName).toBe("GPT-4");
    });

    it("defaults modelName to undefined when the field is missing", () => {
      const coerced = coerceConversationState(makeStateWithRun(baseRun()))!;
      expect(coerced.runs["r1"].modelName).toBeUndefined();
    });

    it("accepts explicit null and coerces it to undefined", () => {
      const coerced = coerceConversationState(
        makeStateWithRun(baseRun({ modelName: null })),
      )!;
      expect(coerced.runs["r1"].modelName).toBeUndefined();
    });

    it("rejects a non-string modelName", () => {
      expect(coerceConversationState(makeStateWithRun(baseRun({ modelName: 5 })))).toBeNull();
      expect(coerceConversationState(makeStateWithRun(baseRun({ modelName: true })))).toBeNull();
      expect(coerceConversationState(makeStateWithRun(baseRun({ modelName: {} })))).toBeNull();
    });
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

  it("replaces failed runs with an assistant error marker and keeps the user message", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r1",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
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
    expect(next.messages).toEqual([
      { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      {
        id: "assistant-r1",
        role: "assistant",
        parts: [{ type: "text", text: "" }],
        metadata: { kind: "error", runId: "r1", mode: "chat" },
      },
    ]);
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("rewrites assistant generated-cards messages from a failed run into an error marker", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Make cards" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "" }],
          metadata: { kind: "generated-cards", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "cards",
          status: "failed",
          error: { message: "Provider error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({});
    expect(next.messages).toEqual([
      { id: "user-r1", role: "user", parts: [{ type: "text", text: "Make cards" }] },
      {
        id: "assistant-r1",
        role: "assistant",
        parts: [{ type: "text", text: "" }],
        metadata: { kind: "error", runId: "r1", mode: "cards" },
      },
    ]);
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

  it("removes only the failed run, keeps the successful run, and rewrites the failed assistant message into an error marker", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: null,
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "Response 1" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        {
          id: "assistant-r2",
          role: "assistant",
          parts: [{ type: "text", text: "" }],
          metadata: { kind: "chat-text", runId: "r2" },
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
      {
        id: "assistant-r1",
        role: "assistant",
        parts: [{ type: "text", text: "Response 1" }],
        metadata: { kind: "chat-text", runId: "r1" },
      },
      { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
      {
        id: "assistant-r2",
        role: "assistant",
        parts: [{ type: "text", text: "" }],
        metadata: { kind: "error", runId: "r2", mode: "chat" },
      },
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

  it("clears lastReadRunId when the run it points to is dropped as streaming", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      lastReadRunId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: null,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({});
    expect(next.lastReadRunId).toBeNull();
  });

  it("clears lastReadRunId when the run it points to is dropped as failed", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      lastReadRunId: "r1",
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
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual({});
    expect(next.lastReadRunId).toBeNull();
  });

  it("preserves lastReadRunId when the run it points to survives normalization", () => {
    // WHY: Force normalization via pending card statuses so the
    // function returns a non-null state. The lastReadRunId should
    // survive the round-trip because the run it points to is kept.
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      lastReadRunId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "cards",
          status: "success",
          cards: [
            { content: { "1": { text: "A" } } },
            { content: { "1": { text: "B" } } },
          ],
          cardStatuses: { 0: "pending", 1: "success" },
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"].status).toBe("success");
    expect(next.runs["r1"].cardStatuses).toEqual({ 0: "idle", 1: "success" });
    expect(next.lastReadRunId).toBe("r1");
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

    it("stamps modelName on the new run when provided", () => {
      const state = conversationReducer(initialConversationState, {
        type: "startRun",
        runId: "r1",
        mode: "chat",
        request: {},
        modelName: "GPT-4",
      });

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("leaves modelName undefined when not provided", () => {
      const state = conversationReducer(initialConversationState, {
        type: "startRun",
        runId: "r1",
        mode: "chat",
        request: {},
      });

      expect(state.runs["r1"].modelName).toBeUndefined();
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
        mode: "cards",
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

    it("creates a fresh run and rewrites the assistant error marker back to its original kind when the run is missing", () => {
      const state = conversationReducer(
        {
          ...initialConversationState,
          messages: [
            { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
            {
              id: "assistant-r1",
              role: "assistant",
              parts: [{ type: "text", text: "" }],
              metadata: { kind: "error", runId: "r1", mode: "chat" },
            },
          ],
        },
        {
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "chat",
        },
      );

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].mode).toBe("chat");
      expect(state.activeRunId).toBe("r1");
      expect(state.messages[1]).toEqual({
        id: "assistant-r1",
        role: "assistant",
        parts: [{ type: "text", text: "" }],
        metadata: { kind: "chat-text", runId: "r1" },
      });
    });

    it("creates a fresh run and rewrites the assistant error marker back to generated-cards when the run is missing in cards mode", () => {
      const state = conversationReducer(
        {
          ...initialConversationState,
          messages: [
            { id: "user-r1", role: "user", parts: [{ type: "text", text: "Make cards" }] },
            {
              id: "assistant-r1",
              role: "assistant",
              parts: [{ type: "text", text: "" }],
              metadata: { kind: "error", runId: "r1", mode: "cards" },
            },
          ],
        },
        {
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "cards",
        },
      );

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].mode).toBe("cards");
      expect(state.activeRunId).toBe("r1");
      expect(state.messages[1]).toEqual({
        id: "assistant-r1",
        role: "assistant",
        parts: [{ type: "text", text: "" }],
        metadata: { kind: "generated-cards", runId: "r1" },
      });
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
        mode: "cards",
      });

      expect(state.runs["r1"].request).toEqual({ updated: true });
      expect(state.runs["r1"].templateFields).toEqual(nextFields);
    });

    it("overwrites modelName when a new value is provided", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "chat", request: {}, modelName: "GPT-4" },
      ]);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      state = conversationReducer(state, {
        type: "restartRun",
        runId: "r1",
        request: {},
        templateFields: null,
        mode: "chat",
        modelName: "Claude",
      });

      expect(state.runs["r1"].modelName).toBe("Claude");
    });

    it("preserves the existing modelName when restartRun omits it", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "chat", request: {}, modelName: "GPT-4" },
      ]);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      state = conversationReducer(state, {
        type: "restartRun",
        runId: "r1",
        request: {},
        templateFields: null,
        mode: "chat",
      });

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("preserves the existing modelName when restartRun sets it to undefined", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "chat", request: {}, modelName: "GPT-4" },
      ]);
      state = conversationReducer(state, { type: "completeRun", runId: "r1" });

      state = conversationReducer(state, {
        type: "restartRun",
        runId: "r1",
        request: {},
        templateFields: null,
        mode: "chat",
        modelName: undefined,
      });

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("uses the action's modelName when the run is missing", () => {
      const state = conversationReducer(initialConversationState, {
        type: "restartRun",
        runId: "r1",
        request: {},
        templateFields: null,
        mode: "chat",
        modelName: "Claude",
      });

      expect(state.runs["r1"].modelName).toBe("Claude");
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

  describe("markRead", () => {
    function withRun(state: ConversationState, runId: string): ConversationState {
      return {
        ...state,
        runs: {
          ...state.runs,
          [runId]: {
            id: runId,
            mode: "chat",
            status: "success",
            cards: [],
            cardStatuses: {},
            templateFields: null,
            startedAt: new Date(1),
            elapsedSeconds: 1,
          },
        },
      };
    }

    it("sets lastReadRunId to the action's runId", () => {
      const state = withRun(initialConversationState, "r1");
      const next = conversationReducer(state, { type: "markRead", runId: "r1" });
      expect(next.lastReadRunId).toBe("r1");
    });

    it("replaces the previous lastReadRunId when the run id changes", () => {
      let state = withRun(initialConversationState, "r1");
      state = conversationReducer(state, { type: "markRead", runId: "r1" });
      expect(state.lastReadRunId).toBe("r1");

      state = withRun(state, "r2");
      const next = conversationReducer(state, { type: "markRead", runId: "r2" });
      expect(next.lastReadRunId).toBe("r2");
    });

    it("is idempotent on the same run id (returns the same state reference)", () => {
      let state = withRun(initialConversationState, "r1");
      state = conversationReducer(state, { type: "markRead", runId: "r1" });

      const next = conversationReducer(state, { type: "markRead", runId: "r1" });
      // WHY: Returning the same reference lets `applyConversationUpdate`
      // skip the updatedAt stamp on idempotent markRead dispatches.
      expect(next).toBe(state);
    });

    it("ignores an unknown run id (no pointer to update)", () => {
      const state = withRun(initialConversationState, "r1");
      const next = conversationReducer(state, { type: "markRead", runId: "missing" });
      expect(next).toBe(state);
      expect(next.lastReadRunId).toBeNull();
    });
  });

  describe("newConversation", () => {
    it("resets to a fresh conversation with the provided id and createdAt", () => {
      const createdAt = new Date(1234);
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "chat", request: {} },
        { type: "setDeck", deckId: 3 },
        { type: "setAIProfile", profileId: "p1", modelId: "m1", modelParameters: { reasoning_effort: "high" } },
        { type: "setAIModel", modelId: "m2", modelParameters: { reasoning_effort: "low" } },
        { type: "setAIModelParameter", paramType: "reasoning_effort", value: "medium" },
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
        profileId: null,
        modelId: null,
        modelParameters: {},
        lastReadRunId: null,
      });
    });
  });

  describe("setAIProfile", () => {
    it("sets the profile, model, and clears parameters by default", () => {
      let state = reduce([
        { type: "setAIProfile", profileId: "p1", modelId: "m1", modelParameters: { reasoning_effort: "high" } },
      ]);
      state = conversationReducer(state, { type: "setAIProfile", profileId: "p2", modelId: "m2" });
      expect(state.profileId).toBe("p2");
      expect(state.modelId).toBe("m2");
      expect(state.modelParameters).toEqual({});
    });

    it("preserves provided parameters", () => {
      const state = conversationReducer(initialConversationState, {
        type: "setAIProfile",
        profileId: "p1",
        modelId: "m1",
        modelParameters: { reasoning_effort: "low" },
      });
      expect(state.modelParameters).toEqual({ reasoning_effort: "low" });
    });
  });

  describe("setAIModel", () => {
    it("sets the model and clears parameters by default", () => {
      let state = reduce([
        { type: "setAIProfile", profileId: "p1", modelId: "m1", modelParameters: { reasoning_effort: "high" } },
      ]);
      state = conversationReducer(state, { type: "setAIModel", modelId: "m2" });
      expect(state.modelId).toBe("m2");
      expect(state.modelParameters).toEqual({});
    });

    it("preserves provided parameters", () => {
      const state = conversationReducer(initialConversationState, {
        type: "setAIModel",
        modelId: "m2",
        modelParameters: { reasoning_effort: "low" },
      });
      expect(state.modelParameters).toEqual({ reasoning_effort: "low" });
    });
  });

  describe("setAIModelParameter", () => {
    it("sets a single parameter value", () => {
      const state = conversationReducer(initialConversationState, {
        type: "setAIModelParameter",
        paramType: "reasoning_effort",
        value: "high",
      });
      expect(state.modelParameters).toEqual({ reasoning_effort: "high" });
    });

    it("removes the parameter when value is null", () => {
      let state = conversationReducer(initialConversationState, {
        type: "setAIModelParameter",
        paramType: "reasoning_effort",
        value: "high",
      });
      state = conversationReducer(state, {
        type: "setAIModelParameter",
        paramType: "reasoning_effort",
        value: null,
      });
      expect(state.modelParameters).toEqual({});
    });

    it("removes the parameter when value is empty string", () => {
      let state = conversationReducer(initialConversationState, {
        type: "setAIModelParameter",
        paramType: "reasoning_effort",
        value: "high",
      });
      state = conversationReducer(state, {
        type: "setAIModelParameter",
        paramType: "reasoning_effort",
        value: "",
      });
      expect(state.modelParameters).toEqual({});
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

describe("cancelStreamingRuns", () => {
  // The persist-time transform needs a deterministic clock so the
  // recomputed `elapsedSeconds` is predictable. We freeze the wall clock
  // for the duration of each test and let `Date.now()` pick it up.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:30Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a single streaming run as canceled, clears activeRunId, and recomputes elapsedSeconds", () => {
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
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: null,
        },
      },
    };

    const next = cancelStreamingRuns(state);

    expect(next.runs["r1"]?.status).toBe("canceled");
    expect(next.runs["r1"]?.elapsedSeconds).toBe(30);
    expect(next.activeRunId).toBeNull();
  });

  it("cancels every streaming run in the map, leaving terminal-status runs untouched", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: "r2",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 5,
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:10Z"),
          elapsedSeconds: null,
        },
        r3: {
          id: "r3",
          mode: "cards",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date("2026-07-01T12:00:20Z"),
          elapsedSeconds: null,
        },
      },
    };

    const next = cancelStreamingRuns(state);

    expect(next.runs["r1"]).toBe(state.runs["r1"]);
    expect(next.runs["r2"]?.status).toBe("canceled");
    expect(next.runs["r2"]?.elapsedSeconds).toBe(20);
    expect(next.runs["r3"]?.status).toBe("canceled");
    expect(next.runs["r3"]?.elapsedSeconds).toBe(10);
    expect(next.activeRunId).toBeNull();
  });

  it("returns the same reference when no runs are streaming", () => {
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
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: 5,
        },
      },
    };

    expect(cancelStreamingRuns(state)).toBe(state);
  });

  it("does not touch non-run fields such as messages, deckId, or modelParameters", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      mode: "cards",
      deckId: 42,
      profileId: "prof-1",
      modelId: "model-1",
      modelParameters: { temperature: "0.2" },
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
          startedAt: new Date("2026-07-01T12:00:00Z"),
          elapsedSeconds: null,
        },
      },
    };

    const next = cancelStreamingRuns(state);

    expect(next.messages).toBe(state.messages);
    expect(next.deckId).toBe(42);
    expect(next.profileId).toBe("prof-1");
    expect(next.modelId).toBe("model-1");
    expect(next.modelParameters).toEqual({ temperature: "0.2" });
    expect(next.createdAt).toBe(state.createdAt);
  });
});

// WHY: See ASSISTANT-CHAT-MESSAGES.md §Reverting the Conversation.
describe("conversationReducer → revertToUserMessage", () => {
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

  function cardsRun(runId: string, status: "streaming" | "success" | "failed" | "canceled" = "success") {
    return {
      id: runId,
      mode: "cards" as const,
      status,
      cards: [],
      cardStatuses: {},
      templateFields: null,
      startedAt: new Date("2026-07-01T12:00:00Z"),
      elapsedSeconds: status === "streaming" ? null : 1,
    };
  }

  it("is a no-op when the target user message does not exist", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Hello" }] },
      ],
      runs: { r1: chatRun("r1") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-missing" });
    expect(next).toBe(state);
  });

  it("removes the target user message and all subsequent messages", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      mode: "chat",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Reply 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", metadata: { kind: "chat-text", runId: "r2" }, parts: [{ type: "text", text: "Reply 2" }] },
        { id: "user-r3", role: "user", parts: [{ type: "text", text: "Third" }] },
        { id: "assistant-r3", role: "assistant", metadata: { kind: "chat-text", runId: "r3" }, parts: [{ type: "text", text: "Reply 3" }] },
      ],
      runs: { r1: chatRun("r1"), r2: chatRun("r2"), r3: chatRun("r3") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r2" });
    expect(next.messages.map((m) => m.id)).toEqual(["user-r1", "assistant-r1"]);
  });

  it("removes the target run and all subsequent runs", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Reply 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", metadata: { kind: "chat-text", runId: "r2" }, parts: [{ type: "text", text: "Reply 2" }] },
      ],
      runs: { r1: chatRun("r1"), r2: chatRun("r2") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r2" });
    expect(Object.keys(next.runs)).toEqual(["r1"]);
  });

  it("sets mode to the reverted run's mode when reverting a cards run", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      mode: "chat",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Reply 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", metadata: { kind: "generated-cards", runId: "r2" }, parts: [{ type: "text", text: "" }] },
      ],
      runs: { r1: chatRun("r1"), r2: cardsRun("r2") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r2" });
    expect(next.mode).toBe("cards");
  });

  it("resolves mode from assistant message metadata when the run is missing (failed-restored case)", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      mode: "chat",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        // WHY: error markers are left behind when a failed run is removed
        // on restore (see normalizeRestoredConversation). The mode is
        // preserved on the error marker metadata.
        { id: "assistant-r1", role: "assistant", metadata: { kind: "error", runId: "r1", mode: "cards" }, parts: [{ type: "text", text: "" }] },
      ],
      runs: {},
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r1" });
    expect(next.mode).toBe("cards");
  });

  it("clears activeRunId and dismissedRunErrorId", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      activeRunId: "r2",
      dismissedRunErrorId: "r1",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Reply 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", metadata: { kind: "chat-text", runId: "r2" }, parts: [{ type: "text", text: "Reply 2" }] },
      ],
      runs: { r1: chatRun("r1"), r2: chatRun("r2", "streaming") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r2" });
    expect(next.activeRunId).toBeNull();
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("clears lastReadRunId when it points to a removed run", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      lastReadRunId: "r2",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Reply 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", metadata: { kind: "chat-text", runId: "r2" }, parts: [{ type: "text", text: "Reply 2" }] },
      ],
      runs: { r1: chatRun("r1"), r2: chatRun("r2") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r2" });
    expect(next.lastReadRunId).toBeNull();
  });

  it("preserves lastReadRunId when it points to a surviving run", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      lastReadRunId: "r1",
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "First" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Reply 1" }] },
        { id: "user-r2", role: "user", parts: [{ type: "text", text: "Second" }] },
        { id: "assistant-r2", role: "assistant", metadata: { kind: "chat-text", runId: "r2" }, parts: [{ type: "text", text: "Reply 2" }] },
      ],
      runs: { r1: chatRun("r1"), r2: chatRun("r2") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r2" });
    expect(next.lastReadRunId).toBe("r1");
  });

  it("preserves deckId, profileId, modelId, and modelParameters", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      deckId: 42,
      profileId: "prof-1",
      modelId: "model-1",
      modelParameters: { reasoning_effort: "high" },
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Hello" }] },
      ],
      runs: { r1: chatRun("r1") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r1" });
    expect(next.deckId).toBe(42);
    expect(next.profileId).toBe("prof-1");
    expect(next.modelId).toBe("model-1");
    expect(next.modelParameters).toEqual({ reasoning_effort: "high" });
  });

  it("results in an empty state when reverting the only user message", () => {
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "chat-text", runId: "r1" }, parts: [{ type: "text", text: "Hello" }] },
      ],
      runs: { r1: chatRun("r1") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r1" });
    expect(next.messages).toEqual([]);
    expect(next.runs).toEqual({});
    expect(next.activeRunId).toBeNull();
  });

  it("preserves the deckId and other config when reverting a cards run that would have caused a lock", () => {
    // WHY: Per ASSISTANT-CHAT-MESSAGES.md, the deck stays locked even if
    // the run that caused the lock is reverted. The reducer must not
    // touch deckId / profileId / modelId.
    const state: ConversationState = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date("2026-07-01T11:00:00Z"),
      mode: "cards",
      deckId: 7,
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Make cards" }] },
        { id: "assistant-r1", role: "assistant", metadata: { kind: "generated-cards", runId: "r1" }, parts: [{ type: "text", text: "" }] },
      ],
      runs: { r1: cardsRun("r1", "success") },
    };
    const next = conversationReducer(state, { type: "revertToUserMessage", userMessageId: "user-r1" });
    expect(next.deckId).toBe(7);
  });
});
