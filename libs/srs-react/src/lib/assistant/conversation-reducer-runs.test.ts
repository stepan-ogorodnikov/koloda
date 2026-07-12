import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelStreamingRuns } from "./conversation-persistence";
import { conversationReducer, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerState } from "./conversation-reducer";
import { act, reduce } from "./conversation-reducer.fixtures";

describe("conversationReducer", () => {
  describe("startRun", () => {
    it("creates a new run with streaming status and sets activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const state = conversationReducer(
        initialConversationState,
        act({
          type: "startRun",
          runId: "r1",
          mode: "chat",
          request: { prompt: "test" },
        }),
      );

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

      const state = conversationReducer(
        initialConversationState,
        act({
          type: "startRun",
          runId: "r1",
          mode: "cards",
          request: {},
          templateFields: fields,
        }),
      );

      expect(state.runs["r1"].templateFields).toEqual(fields);
    });

    it("stamps modelName on the new run when provided", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "startRun",
          runId: "r1",
          mode: "chat",
          request: {},
          modelName: "GPT-4",
        }),
      );

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("leaves modelName undefined when not provided", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "startRun",
          runId: "r1",
          mode: "chat",
          request: {},
        }),
      );

      expect(state.runs["r1"].modelName).toBeUndefined();
    });
  });

  describe("addCard", () => {
    it("adds a card to the run's cards array and seeds idle status", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "cards", request: {} }]);
      state = conversationReducer(
        state,
        act({
          type: "addCard",
          runId: "r1",
          card: { content: { "1": { text: "Front" } } },
        }),
      );
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
      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));

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

      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));
      expect(state.runs["r1"].status).toBe("success");
      expect(state.activeRunId).toBe("r2");
    });
  });

  describe("runFailed", () => {
    it("sets status to failed, stores error, computes elapsed time, and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);

      vi.setSystemTime(3000);
      state = conversationReducer(
        state,
        act({
          type: "runFailed",
          runId: "r1",
          error: { message: "Network error" },
        }),
      );

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

      state = conversationReducer(
        state,
        act({
          type: "runFailed",
          runId: "r1",
          error: { message: "Other error" },
        }),
      );
      expect(state.runs["r1"].status).toBe("failed");
      expect(state.activeRunId).toBe("r2");
    });
  });

  describe("cancelRun", () => {
    it("sets status to canceled and clears activeRunId", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);
      state = conversationReducer(state, act({ type: "cancelRun", runId: "r1" }));

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
      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));

      vi.setSystemTime(10_000);
      state = conversationReducer(
        state,
        act({
          type: "restartRun",
          runId: "r1",
          request: { updated: true },
          templateFields: null,
          mode: "cards",
        }),
      );

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
        act({
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "chat",
        }),
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
        act({
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "cards",
        }),
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
      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));

      const nextFields = [{ id: 2, title: "Back", type: "text" as const, isRequired: false }];
      state = conversationReducer(
        state,
        act({
          type: "restartRun",
          runId: "r1",
          request: { updated: true },
          templateFields: nextFields,
          mode: "cards",
        }),
      );

      expect(state.runs["r1"].request).toEqual({ updated: true });
      expect(state.runs["r1"].templateFields).toEqual(nextFields);
    });

    it("overwrites modelName when a new value is provided", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {}, modelName: "GPT-4" }]);
      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));

      state = conversationReducer(
        state,
        act({
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "chat",
          modelName: "Claude",
        }),
      );

      expect(state.runs["r1"].modelName).toBe("Claude");
    });

    it("preserves the existing modelName when restartRun omits it", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {}, modelName: "GPT-4" }]);
      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));

      state = conversationReducer(
        state,
        act({
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "chat",
        }),
      );

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("preserves the existing modelName when restartRun sets it to undefined", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {}, modelName: "GPT-4" }]);
      state = conversationReducer(state, act({ type: "completeRun", runId: "r1" }));

      state = conversationReducer(
        state,
        act({
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "chat",
          modelName: undefined,
        }),
      );

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("uses the action's modelName when the run is missing", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "restartRun",
          runId: "r1",
          request: {},
          templateFields: null,
          mode: "chat",
          modelName: "Claude",
        }),
      );

      expect(state.runs["r1"].modelName).toBe("Claude");
    });
  });

  describe("setUsage", () => {
    it("sets usage on the specified run", () => {
      let state = reduce([{ type: "startRun", runId: "r1", mode: "chat", request: {} }]);
      const usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
      state = conversationReducer(state, act({ type: "setUsage", runId: "r1", usage }));
      expect(state.runs["r1"].usage).toEqual(usage);
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
    const state: ConversationReducerState = {
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
