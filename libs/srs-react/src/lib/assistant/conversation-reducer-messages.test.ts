import { describe, expect, it } from "vitest";
import { conversationReducer, getVisibleMessages, initialConversationState } from "./conversation-reducer";
import { act, reduce } from "./conversation-reducer.fixtures";

describe("conversationReducer", () => {
  describe("addUserMessage", () => {
    it("appends a user message to the messages array", () => {
      const state = reduce([{ type: "addUserMessage", runId: "r1", text: "Hello" }]);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("user");
      expect(state.messages[0].id).toBe("user-r1");
      expect(state.messages[0].metadata).toEqual({
        createdAt: expect.any(String),
      });
    });
  });

  describe("addAssistantMessage", () => {
    it("appends an assistant message with chat-text metadata", () => {
      const state = reduce([{ type: "addAssistantMessage", runId: "r1", kind: "chat-text", text: "Hi there" }]);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("assistant");
      expect(state.messages[0].id).toBe("assistant-r1");
    });
  });

  describe("updateAssistantText", () => {
    it("updates the text of the matching assistant message in-place", () => {
      let state = reduce([{ type: "addAssistantMessage", runId: "r1", kind: "chat-text", text: "..." }]);
      state = conversationReducer(
        state,
        act({
          type: "updateAssistantText",
          runId: "r1",
          text: "Done",
        }),
      );
      expect(state.messages[0].parts).toEqual([{ type: "text", text: "Done" }]);
    });

    it("does nothing when no message matches the runId", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "updateAssistantText",
          runId: "missing",
          text: "Nope",
        }),
      );
      expect(state.messages).toEqual([]);
    });
  });
  describe("setMode", () => {
    it("changes the conversation mode", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "setMode",
          mode: "cards",
        }),
      );
      expect(state.mode).toBe("cards");
    });
  });

  describe("setDeck", () => {
    it("sets the deck when the conversation is not locked", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "setDeck",
          deckId: 5,
        }),
      );
      expect(state.deckId).toBe(5);
    });

    it("is allowed after a user message but before any successful generated-cards run", () => {
      let state = reduce([{ type: "addUserMessage", runId: "r1", text: "Hi" }]);
      state = conversationReducer(state, act({ type: "setDeck", deckId: 5 }));
      expect(state.deckId).toBe(5);
    });

    it("stays unlocked when a generated-cards run is still streaming or failed", () => {
      let state = reduce([
        { type: "addUserMessage", runId: "r1", text: "Hi" },
        { type: "startRun", runId: "r1", mode: "cards", request: {} },
        { type: "addAssistantMessage", runId: "r1", kind: "generated-cards", text: "" },
        { type: "runFailed", runId: "r1", error: { message: "failed" } },
      ]);
      state = conversationReducer(state, act({ type: "setDeck", deckId: 7 }));
      expect(state.deckId).toBe(7);
    });
  });

  describe("setCardStatus", () => {
    it("updates the status of a card by index", () => {
      let state = reduce([
        { type: "startRun", runId: "r1", mode: "cards", request: {} },
        { type: "addCard", runId: "r1", card: { content: {} } },
      ]);
      state = conversationReducer(state, act({ type: "setCardStatus", runId: "r1", index: 0, status: "success" }));
      expect(state.runs["r1"].cardStatuses).toEqual({ 0: "success" });
    });
  });

  describe("markRead", () => {
    function withRun(state: ConversationReducerState, runId: string): ConversationReducerState {
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
      const next = conversationReducer(state, act({ type: "markRead", runId: "r1" }));
      expect(next.lastReadRunId).toBe("r1");
    });

    it("replaces the previous lastReadRunId when the run id changes", () => {
      let state = withRun(initialConversationState, "r1");
      state = conversationReducer(state, act({ type: "markRead", runId: "r1" }));
      expect(state.lastReadRunId).toBe("r1");

      state = withRun(state, "r2");
      const next = conversationReducer(state, act({ type: "markRead", runId: "r2" }));
      expect(next.lastReadRunId).toBe("r2");
    });

    it("is idempotent on the same run id (returns the same state reference)", () => {
      let state = withRun(initialConversationState, "r1");
      state = conversationReducer(state, act({ type: "markRead", runId: "r1" }));

      const next = conversationReducer(state, act({ type: "markRead", runId: "r1" }));
      // WHY: Returning the same reference lets `applyConversationUpdate`
      // skip the updatedAt stamp on idempotent markRead dispatches.
      expect(next).toBe(state);
    });

    it("ignores an unknown run id (no pointer to update)", () => {
      const state = withRun(initialConversationState, "r1");
      const next = conversationReducer(state, act({ type: "markRead", runId: "missing" }));
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
      state = conversationReducer(state, act({ type: "newConversation", id: "new-id", createdAt }));

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
        revertState: null,
      });
    });
  });

  describe("setAIProfile", () => {
    it("sets the profile, model, and clears parameters by default", () => {
      let state = reduce([
        { type: "setAIProfile", profileId: "p1", modelId: "m1", modelParameters: { reasoning_effort: "high" } },
      ]);
      state = conversationReducer(state, act({ type: "setAIProfile", profileId: "p2", modelId: "m2" }));
      expect(state.profileId).toBe("p2");
      expect(state.modelId).toBe("m2");
      expect(state.modelParameters).toEqual({});
    });

    it("preserves provided parameters", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "setAIProfile",
          profileId: "p1",
          modelId: "m1",
          modelParameters: { reasoning_effort: "low" },
        }),
      );
      expect(state.modelParameters).toEqual({ reasoning_effort: "low" });
    });
  });

  describe("setAIModel", () => {
    it("sets the model and clears parameters by default", () => {
      let state = reduce([
        { type: "setAIProfile", profileId: "p1", modelId: "m1", modelParameters: { reasoning_effort: "high" } },
      ]);
      state = conversationReducer(state, act({ type: "setAIModel", modelId: "m2" }));
      expect(state.modelId).toBe("m2");
      expect(state.modelParameters).toEqual({});
    });

    it("preserves provided parameters", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "setAIModel",
          modelId: "m2",
          modelParameters: { reasoning_effort: "low" },
        }),
      );
      expect(state.modelParameters).toEqual({ reasoning_effort: "low" });
    });
  });

  describe("setAIModelParameter", () => {
    it("sets a single parameter value", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "setAIModelParameter",
          paramType: "reasoning_effort",
          value: "high",
        }),
      );
      expect(state.modelParameters).toEqual({ reasoning_effort: "high" });
    });

    it("removes the parameter when value is null", () => {
      let state = conversationReducer(
        initialConversationState,
        act({
          type: "setAIModelParameter",
          paramType: "reasoning_effort",
          value: "high",
        }),
      );
      state = conversationReducer(
        state,
        act({
          type: "setAIModelParameter",
          paramType: "reasoning_effort",
          value: null,
        }),
      );
      expect(state.modelParameters).toEqual({});
    });

    it("removes the parameter when value is empty string", () => {
      let state = conversationReducer(
        initialConversationState,
        act({
          type: "setAIModelParameter",
          paramType: "reasoning_effort",
          value: "high",
        }),
      );
      state = conversationReducer(
        state,
        act({
          type: "setAIModelParameter",
          paramType: "reasoning_effort",
          value: "",
        }),
      );
      expect(state.modelParameters).toEqual({});
    });
  });

  describe("unknown action", () => {
    it("returns the current state unchanged", () => {
      const state = conversationReducer(
        initialConversationState,
        act({
          type: "nonexistent",
        }) as unknown as Parameters<typeof conversationReducer>[1],
      );
      expect(state).toBe(initialConversationState);
    });
  });
});

describe("getVisibleMessages", () => {
  it("returns all messages when revertState is null", () => {
    const messages = [
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      { id: "assistant-r1", role: "assistant" as const, parts: [{ type: "text" as const, text: "Hello" }] },
    ];
    expect(getVisibleMessages(messages, null)).toBe(messages);
  });

  it("returns messages before the revert point", () => {
    const messages = [
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "First" }] },
      { id: "assistant-r1", role: "assistant" as const, parts: [{ type: "text" as const, text: "Reply 1" }] },
      { id: "user-r2", role: "user" as const, parts: [{ type: "text" as const, text: "Second" }] },
      { id: "assistant-r2", role: "assistant" as const, parts: [{ type: "text" as const, text: "Reply 2" }] },
    ];
    const revertState = { revertedToUserMessageId: "user-r2", preRevertInputText: "" };
    expect(getVisibleMessages(messages, revertState)).toEqual([messages[0], messages[1]]);
  });

  it("returns all messages when revert point is not found", () => {
    const messages = [{ id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] }];
    const revertState = { revertedToUserMessageId: "user-missing", preRevertInputText: "" };
    expect(getVisibleMessages(messages, revertState)).toBe(messages);
  });
});
