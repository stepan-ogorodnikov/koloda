import { describe, expect, it } from "vitest";
import { coerceConversationState, normalizeRestoredConversation } from "./conversation-persistence";
import { findLatestErroredRun, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerState } from "./conversation-reducer";

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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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

describe("findLatestErroredRun", () => {
  it("returns the latest failed run that is not dismissed", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1),
          elapsedSeconds: 1,
          error: { message: "old" },
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(2),
          elapsedSeconds: 1,
        },
        r3: {
          id: "r3",
          mode: "cards",
          status: "failed",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(3),
          elapsedSeconds: 1,
          error: { message: "latest" },
        },
      },
    };

    expect(findLatestErroredRun(state)?.id).toBe("r3");
  });

  it("returns null when the only failed run is dismissed", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1),
          elapsedSeconds: 1,
          error: { message: "gone" },
        },
      },
    };

    expect(findLatestErroredRun(state)).toBeNull();
  });

  it("returns null when there are no failed runs", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      runs: {
        r1: {
          id: "r1",
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

    expect(findLatestErroredRun(state)).toBeNull();
  });
});
