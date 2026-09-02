import { describe, expect, it, vi } from "vitest";
import type { DataAccessSnapshot } from "../runs/data-access";
import { conversationReducer, initialConversationState } from "./conversation-reducer";
import type { ConversationReducerState } from "./conversation-reducer";
import { reduce } from "./conversation-reducer.fixtures";

describe("conversationReducer", () => {
  describe("submitTurn", () => {
    it("creates a new run with streaming status and sets activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" },
      ]);

      expect(state.activeRunId).toBe("r1");
      expect(state.runs["r1"]).toMatchObject({
        id: "r1",
        status: "streaming",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: new Date(1000),
        elapsedSeconds: null,
      });

      vi.useRealTimers();
    });

    it("adds the user message and the assistant placeholder alongside the run", () => {
      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" },
      ]);

      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]).toMatchObject({ id: "user-r1", role: "user" });
      expect(state.messages[1]).toMatchObject({
        id: "assistant-r1",
        role: "assistant",
        metadata: { kind: "chat-text" },
      });
    });

    it("stamps templateFields when provided", () => {
      const fields = [{ id: 1, title: "Front", type: "text" as const, isRequired: true }];

      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        {
          runId: "r1",
          text: "hello",
          kind: "chat-text",
          assistantText: "",
          templateFields: fields,
        },
      ]);

      expect(state.runs["r1"].templateFields).toEqual(fields);
    });

    it("stamps modelName on the new run when provided", () => {
      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        {
          runId: "r1",
          text: "hello",
          kind: "chat-text",
          assistantText: "",
          modelName: "GPT-4",
        },
      ]);

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("leaves modelName undefined when not provided", () => {
      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" },
      ]);

      expect(state.runs["r1"].modelName).toBeUndefined();
    });

    it("stores the data access snapshot on the created run", () => {
      const dataAccess: DataAccessSnapshot = {
        context: "User decks:\n- Deck: Spanish — 3 cards — Template: Default (Front, Back)",
        manifest: {
          decks: [{ deckId: 1, title: "Spanish", cardCount: 3, templateTitle: "Default" }],
          writeTarget: null,
        },
      };

      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        {
          runId: "r1",
          text: "hello",
          kind: "chat-text",
          assistantText: "",
          dataAccess,
        },
      ]);

      expect(state.runs["r1"].dataAccess).toBe(dataAccess);
    });

    it("leaves dataAccess undefined when submitTurn carries no snapshot", () => {
      const state = conversationReducer(initialConversationState, [
        "submitTurn",
        {
          runId: "r1",
          text: "hello",
          kind: "chat-text",
          assistantText: "",
        },
      ]);

      expect(state.runs["r1"].dataAccess).toBeUndefined();
    });
  });

  describe("addCard", () => {
    it("adds a card to the run's cards array and seeds idle status", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addCard",
        {
          runId: "r1",
          card: { content: { "1": { text: "Front" } } },
        },
      ]);
      expect(state.runs["r1"].cards).toHaveLength(1);
      expect(state.runs["r1"].cards[0].content["1"].text).toBe("Front");
      expect(state.runs["r1"].cardStatuses).toEqual({ 0: "idle" });
    });
  });

  describe("addToolCall", () => {
    it("appends a tool call with running status", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      expect(state.runs["r1"].toolCalls).toEqual([{ id: "call-1", name: "list_decks", input: {}, status: "running" }]);
    });

    it("closes a running reasoning row before appending the tool call", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["appendAssistantReasoning", { runId: "r1", text: "plan" }]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      expect(state.runs["r1"].toolCalls).toEqual([
        { kind: "reasoning", id: "r1-reasoning-0", text: "plan", status: "done" },
        { id: "call-1", name: "list_decks", input: {}, status: "running" },
      ]);
    });

    it("skips a duplicate tool call id idempotently", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);

      expect(state.runs["r1"].toolCalls).toHaveLength(1);
    });
  });

  describe("setToolCallResult", () => {
    it("resolves a running tool call to success with its output", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      state = conversationReducer(state, [
        "setToolCallResult",
        { runId: "r1", callId: "call-1", output: { decks: [] } },
      ]);

      expect(state.runs["r1"].toolCalls?.[0]).toMatchObject({
        id: "call-1",
        status: "success",
        output: { decks: [] },
      });
    });

    it("keeps outputs at or under the persist cap untruncated", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      // Pad so the serialized output lands exactly ON the cap.
      let payload = "";
      while (JSON.stringify({ decks: payload }).length < 2000) payload += "x";
      const output = { decks: payload };
      expect(JSON.stringify(output).length).toBe(2000);

      state = conversationReducer(state, ["setToolCallResult", { runId: "r1", callId: "call-1", output }]);

      expect(state.runs["r1"].toolCalls?.[0]?.output).toEqual(output);
    });

    it("bounds outputs one char past the persist cap to a summary + preview", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      let payload = "";
      while (JSON.stringify({ decks: payload }).length <= 2000) payload += "x";
      const output = { decks: payload };
      expect(JSON.stringify(output).length).toBe(2001);

      state = conversationReducer(state, ["setToolCallResult", { runId: "r1", callId: "call-1", output }]);

      const stored = state.runs["r1"].toolCalls?.[0]?.output as {
        truncated: boolean;
        itemCount: number;
        preview: string;
      };
      expect(stored.truncated).toBe(true);
      expect(stored.itemCount).toBe(1);
      expect(stored.preview).toHaveLength(400);
      expect(JSON.stringify(stored).length).toBeLessThan(JSON.stringify(output).length);
    });

    it("keeps the executor's totalCards on a bounded get_deck_cards output", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "get_deck_cards", input: {} } },
      ]);
      // get_deck_cards shape: the cards list bloats the serialization past the
      // cap, and the row headline reads totalCards off the stored copy.
      const cards = Array.from({ length: 30 }, (_, i) => ({ fields: { Front: `front ${i}${"x".repeat(120)}` } }));
      const output = { deckTitle: "Deck", totalCards: 30, isCapped: false, cards };
      expect(JSON.stringify(output).length).toBeGreaterThan(2000);

      state = conversationReducer(state, ["setToolCallResult", { runId: "r1", callId: "call-1", output }]);

      const stored = state.runs["r1"].toolCalls?.[0]?.output as {
        truncated: boolean;
        itemCount: number;
        totalCards?: number;
        cards?: unknown;
      };
      expect(stored.truncated).toBe(true);
      expect(stored.totalCards).toBe(30);
      expect(stored.cards).toBeUndefined();
    });

    it("omits totalCards from the bounded record when the output has none", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      let payload = "";
      while (JSON.stringify({ decks: payload }).length <= 2000) payload += "x";
      const output = { decks: payload };

      state = conversationReducer(state, ["setToolCallResult", { runId: "r1", callId: "call-1", output }]);

      const stored = state.runs["r1"].toolCalls?.[0]?.output as { totalCards?: unknown };
      expect("totalCards" in stored).toBe(false);
    });

    it("resolves a running tool call to error with the error payload", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "get_deck_cards", input: { deckId: 9 } } },
      ]);
      state = conversationReducer(state, [
        "setToolCallResult",
        { runId: "r1", callId: "call-1", error: "Deck not found: 9" },
      ]);

      expect(state.runs["r1"].toolCalls?.[0]).toMatchObject({
        id: "call-1",
        status: "error",
        error: "Deck not found: 9",
      });
    });

    it("no-ops on an unmatched callId", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      const next = conversationReducer(state, ["setToolCallResult", { runId: "r1", callId: "missing", output: {} }]);

      expect(next).toEqual(state);
    });

    const proposeOutput = {
      deckId: 5,
      deckTitle: "Spanish verbs",
      templateId: 1,
      templateFields: [
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "text", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ],
      cards: [{ fields: { Front: "hola", Back: "hello", Hint: "greeting" } }],
      rejectedCount: 0,
    };

    function withProposeCall(
      state: ConversationReducerState,
      callId: string,
      output: unknown,
      error?: unknown,
    ): ConversationReducerState {
      const next = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: callId, name: "propose_cards", input: { deckId: 5, cards: [] } } },
      ]);
      return conversationReducer(next, [
        "setToolCallResult",
        error !== undefined ? { runId: "r1", callId, error } : { runId: "r1", callId, output },
      ]);
    }

    it("maps a successful propose_cards output onto run cards, templateFields, and write targets", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = withProposeCall(state, "call-1", proposeOutput);

      expect(state.runs["r1"].cards).toEqual([
        { content: { "10": { text: "hola" }, "11": { text: "hello" }, "12": { text: "greeting" } } },
      ]);
      expect(state.runs["r1"].cardStatuses).toEqual({ 0: "idle" });
      expect(state.runs["r1"].templateFields).toEqual([
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "text", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ]);
      expect(state.runs["r1"].writeTargetDeckId).toBe(5);
      expect(state.runs["r1"].writeTargetTemplateId).toBe(1);
      expect(state.runs["r1"].toolCalls?.[0]).toMatchObject({
        id: "call-1",
        name: "propose_cards",
        status: "success",
        output: proposeOutput,
      });
    });

    it("maps field.type from propose_cards onto run.templateFields, including markdown", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      const markdownOutput = {
        ...proposeOutput,
        templateFields: [
          { id: 10, title: "Front", type: "text", isRequired: true },
          { id: 11, title: "Back", type: "markdown", isRequired: true },
          { id: 12, title: "Hint", type: "text", isRequired: false },
        ],
      };
      state = withProposeCall(state, "call-1", markdownOutput);

      expect(state.runs["r1"].templateFields).toEqual([
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "markdown", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ]);
      expect(state.runs["r1"].writeTargetDeckId).toBe(5);
      expect(state.runs["r1"].writeTargetTemplateId).toBe(1);
    });

    it("records an empty accepted list without setting cards, writeTargetDeckId, writeTargetTemplateId, or templateFields", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      const emptyOutput = { ...proposeOutput, cards: [], rejectedCount: 2 };
      state = withProposeCall(state, "call-1", emptyOutput);

      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].writeTargetDeckId).toBeUndefined();
      expect(state.runs["r1"].writeTargetTemplateId).toBeUndefined();
      expect(state.runs["r1"].templateFields).toBeNull();
      expect(state.runs["r1"].toolCalls?.[0]).toMatchObject({ status: "success", output: emptyOutput });
    });

    it("does not apply cards when propose_cards returns an error", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = withProposeCall(state, "call-1", proposeOutput, "Deck not found: 5");

      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].writeTargetDeckId).toBeUndefined();
      expect(state.runs["r1"].writeTargetTemplateId).toBeUndefined();
      expect(state.runs["r1"].templateFields).toBeNull();
      expect(state.runs["r1"].toolCalls?.[0]).toMatchObject({
        status: "error",
        error: "Deck not found: 5",
      });
    });

    it("stores a malformed successful output without applying cards", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = withProposeCall(state, "call-1", { decks: [] });

      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].writeTargetDeckId).toBeUndefined();
      expect(state.runs["r1"].writeTargetTemplateId).toBeUndefined();
      expect(state.runs["r1"].toolCalls?.[0]).toMatchObject({ status: "success", output: { decks: [] } });
    });

    it("keeps the first write target and ignores a later propose_cards for a different deck", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = withProposeCall(state, "call-1", proposeOutput);
      const otherDeck = {
        ...proposeOutput,
        deckId: 9,
        deckTitle: "Other",
        templateId: 4,
        cards: [{ fields: { Front: "gato", Back: "cat", Hint: "" } }],
      };
      state = withProposeCall(state, "call-2", otherDeck);

      expect(state.runs["r1"].writeTargetDeckId).toBe(5);
      expect(state.runs["r1"].writeTargetTemplateId).toBe(1);
      expect(state.runs["r1"].cards).toHaveLength(1);
      expect(state.runs["r1"].cards[0].content["10"].text).toBe("hola");
      expect(state.runs["r1"].templateFields?.[0]).toMatchObject({ id: 10, title: "Front" });
      expect(state.runs["r1"].toolCalls).toHaveLength(2);
      expect(state.runs["r1"].toolCalls?.[1]).toMatchObject({ id: "call-2", status: "success", output: otherDeck });
    });

    it("appends cards from a later propose_cards for the same deck without replacing templateFields", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = withProposeCall(state, "call-1", proposeOutput);
      const second = {
        ...proposeOutput,
        templateId: 4,
        templateFields: [
          { id: 10, title: "Front", type: "text", isRequired: true },
          { id: 99, title: "Changed", type: "markdown", isRequired: false },
        ],
        cards: [{ fields: { Front: "gato", Back: "cat", Hint: "" } }],
      };
      state = withProposeCall(state, "call-2", second);

      expect(state.runs["r1"].writeTargetDeckId).toBe(5);
      expect(state.runs["r1"].writeTargetTemplateId).toBe(1);
      expect(state.runs["r1"].cards).toEqual([
        { content: { "10": { text: "hola" }, "11": { text: "hello" }, "12": { text: "greeting" } } },
        { content: { "10": { text: "gato" }, "99": { text: "" } } },
      ]);
      expect(state.runs["r1"].cardStatuses).toEqual({ 0: "idle", 1: "idle" });
      expect(state.runs["r1"].templateFields).toEqual([
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "text", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ]);
    });
  });

  describe("completeRun", () => {
    it("sets status to success, computes elapsedSeconds, and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);

      vi.setSystemTime(5000);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      expect(state.runs["r1"].status).toBe("success");
      expect(state.runs["r1"].elapsedSeconds).toBe(5);
      expect(state.runs["r1"].error).toBeUndefined();
      expect(state.activeRunId).toBeNull();

      vi.useRealTimers();
    });

    it("closes a running reasoning row when the run completes", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["appendAssistantReasoning", { runId: "r1", text: "plan" }]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);
      expect(state.runs["r1"].toolCalls).toEqual([
        { kind: "reasoning", id: "r1-reasoning-0", text: "plan", status: "done" },
      ]);
    });

    it("does not clear activeRunId when a different run completes", () => {
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }],
        ["submitTurn", { runId: "r2", text: "hello", kind: "chat-text", assistantText: "" }],
      ]);
      expect(state.activeRunId).toBe("r2");

      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);
      expect(state.runs["r1"].status).toBe("success");
      expect(state.activeRunId).toBe("r2");
    });

    it("does not copy writeTargetDeckId onto the conversation", () => {
      const proposeOutput = {
        deckId: 5,
        deckTitle: "Spanish",
        templateId: 1,
        templateTitle: "Default",
        templateFields: [
          { id: 10, title: "Front", type: "text", isRequired: true },
          { id: 11, title: "Back", type: "text", isRequired: true },
        ],
        cards: [{ fields: { Front: "hola", Back: "hello" } }],
        rejectedCount: 0,
      };
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "propose_cards", input: { deckId: 5, cards: [] } } },
      ]);
      state = conversationReducer(state, [
        "setToolCallResult",
        { runId: "r1", callId: "call-1", output: proposeOutput },
      ]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);
      expect(state).not.toHaveProperty("deckId");
      expect(state.runs["r1"].writeTargetDeckId).toBe(5);
    });
  });

  describe("runFailed", () => {
    it("sets status to failed, stores error, computes elapsed time, and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);

      vi.setSystemTime(3000);
      state = conversationReducer(state, [
        "runFailed",
        {
          runId: "r1",
          error: { message: "Network error" },
        },
      ]);

      expect(state.runs["r1"].status).toBe("failed");
      expect(state.runs["r1"].error).toEqual({ message: "Network error" });
      expect(state.runs["r1"].elapsedSeconds).toBe(3);
      expect(state.activeRunId).toBeNull();

      vi.useRealTimers();
    });

    it("does not clear activeRunId when a different run fails", () => {
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }],
        ["submitTurn", { runId: "r2", text: "hello", kind: "chat-text", assistantText: "" }],
      ]);
      expect(state.activeRunId).toBe("r2");

      state = conversationReducer(state, [
        "runFailed",
        {
          runId: "r1",
          error: { message: "Other error" },
        },
      ]);
      expect(state.runs["r1"].status).toBe("failed");
      expect(state.activeRunId).toBe("r2");
    });
  });

  describe("cancelRun", () => {
    it("sets status to canceled with reason user and clears activeRunId", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["cancelRun", { runId: "r1" }]);

      expect(state.runs["r1"].status).toBe("canceled");
      expect(state.runs["r1"].reason).toBe("user");
      expect(state.activeRunId).toBeNull();
    });
  });

  describe("interruptRun", () => {
    it("sets status to interrupted with the given reason and clears activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);

      vi.setSystemTime(4000);
      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "app_shutdown" }]);

      expect(state.runs["r1"].status).toBe("interrupted");
      expect(state.runs["r1"].reason).toBe("app_shutdown");
      expect(state.runs["r1"].elapsedSeconds).toBe(4);
      expect(state.activeRunId).toBeNull();

      vi.useRealTimers();
    });

    it("records crash_recovery as the interruption reason", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "crash_recovery" }]);

      expect(state.runs["r1"].status).toBe("interrupted");
      expect(state.runs["r1"].reason).toBe("crash_recovery");
    });

    it("does not clear activeRunId when a different run is interrupted", () => {
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }],
        ["submitTurn", { runId: "r2", text: "hello", kind: "chat-text", assistantText: "" }],
      ]);
      expect(state.activeRunId).toBe("r2");

      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "app_shutdown" }]);
      expect(state.runs["r1"].status).toBe("interrupted");
      expect(state.activeRunId).toBe("r2");
    });
  });

  describe("illegal terminal transitions", () => {
    it("ignores completeRun after the run already finished", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      vi.setSystemTime(2000);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);
      const afterFirst = state.runs["r1"];

      vi.setSystemTime(9000);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);
      state = conversationReducer(state, ["runFailed", { runId: "r1", error: { message: "late" } }]);
      state = conversationReducer(state, ["cancelRun", { runId: "r1" }]);
      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "app_shutdown" }]);

      expect(state.runs["r1"]).toEqual(afterFirst);
      vi.useRealTimers();
    });

    it("ignores terminal actions after cancel", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["cancelRun", { runId: "r1" }]);
      const afterCancel = state.runs["r1"];

      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);
      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "crash_recovery" }]);

      expect(state.runs["r1"]).toEqual(afterCancel);
      expect(afterCancel.reason).toBe("user");
    });

    it("ignores terminal actions after interrupt", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "crash_recovery" }]);
      const afterInterrupt = state.runs["r1"];

      state = conversationReducer(state, ["cancelRun", { runId: "r1" }]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      expect(state.runs["r1"]).toEqual(afterInterrupt);
      expect(afterInterrupt.reason).toBe("crash_recovery");
    });

    it("ignores terminal actions for a missing runId", () => {
      const state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      const next = conversationReducer(state, ["completeRun", { runId: "missing" }]);
      expect(next).toEqual(state);
    });
  });

  describe("restartRun", () => {
    it("resets run status to streaming, clears cards and statuses, and sets activeRunId", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let state = reduce([
        [
          "submitTurn",
          {
            runId: "r1",
            text: "hello",
            kind: "chat-text",
            assistantText: "",
            templateFields: [{ id: 1, title: "Front", type: "text" as const, isRequired: true }],
          },
        ],
        ["addCard", { runId: "r1", card: { content: {} } }],
      ]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      vi.setSystemTime(10_000);
      state = conversationReducer(state, [
        "restartRun",
        {
          runId: "r1",
          templateFields: null,
        },
      ]);

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].reason).toBeUndefined();
      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].cardStatuses).toEqual({});
      expect(state.runs["r1"].templateFields).toBeNull();
      expect(state.runs["r1"].startedAt).toEqual(new Date(10_000));
      expect(state.runs["r1"].elapsedSeconds).toBeNull();
      expect(state.runs["r1"].usage).toBeUndefined();
      expect(state.runs["r1"].error).toBeUndefined();
      expect(state.activeRunId).toBe("r1");

      vi.useRealTimers();
    });

    it("clears recorded tool calls on restart", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "list_decks", input: {} } },
      ]);
      state = conversationReducer(state, [
        "setToolCallResult",
        { runId: "r1", callId: "call-1", output: { decks: [] } },
      ]);
      state = conversationReducer(state, ["runFailed", { runId: "r1", error: { message: "boom" } }]);

      state = conversationReducer(state, ["restartRun", { runId: "r1", templateFields: null }]);

      // WHY: retry re-executes fresh — stale tool traffic must not survive the restart.
      expect(state.runs["r1"].toolCalls).toEqual([]);
    });

    it("clears cards, toolCalls, and write targets on restart", () => {
      const proposeOutput = {
        deckId: 5,
        deckTitle: "Spanish verbs",
        templateId: 1,
        templateFields: [
          { id: 10, title: "Front", type: "text", isRequired: true },
          { id: 11, title: "Back", type: "text", isRequired: true },
        ],
        cards: [{ fields: { Front: "hola", Back: "hello" } }],
        rejectedCount: 0,
      };
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, [
        "addToolCall",
        { runId: "r1", call: { id: "call-1", name: "propose_cards", input: { deckId: 5, cards: [] } } },
      ]);
      state = conversationReducer(state, [
        "setToolCallResult",
        { runId: "r1", callId: "call-1", output: proposeOutput },
      ]);
      state = conversationReducer(state, ["runFailed", { runId: "r1", error: { message: "boom" } }]);

      expect(state.runs["r1"].writeTargetDeckId).toBe(5);
      expect(state.runs["r1"].writeTargetTemplateId).toBe(1);
      expect(state.runs["r1"].cards).toHaveLength(1);

      state = conversationReducer(state, ["restartRun", { runId: "r1", templateFields: null }]);

      expect(state.runs["r1"].cards).toEqual([]);
      expect(state.runs["r1"].cardStatuses).toEqual({});
      expect(state.runs["r1"].toolCalls).toEqual([]);
      expect(state.runs["r1"].writeTargetDeckId).toBeUndefined();
      expect(state.runs["r1"].writeTargetTemplateId).toBeUndefined();
    });

    it("clears termination reason when restarting a canceled or interrupted run", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      state = conversationReducer(state, ["cancelRun", { runId: "r1" }]);
      expect(state.runs["r1"].reason).toBe("user");

      state = conversationReducer(state, ["restartRun", { runId: "r1", templateFields: null }]);
      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].reason).toBeUndefined();

      state = conversationReducer(state, ["interruptRun", { runId: "r1", reason: "app_shutdown" }]);
      expect(state.runs["r1"].reason).toBe("app_shutdown");

      state = conversationReducer(state, ["restartRun", { runId: "r1", templateFields: null }]);
      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"].reason).toBeUndefined();
    });

    it("creates a fresh run and rewrites the assistant error marker back to its original kind when the run is missing", () => {
      const state = conversationReducer(
        {
          ...initialConversationState,
          messages: [
            {
              id: "user-r1",
              role: "user",
              parts: [{ type: "text", text: "Hi" }],
              metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
            },
            {
              id: "assistant-r1",
              role: "assistant",
              parts: [{ type: "text", text: "" }],
              metadata: { kind: "error", runId: "r1" },
            },
          ],
        },
        [
          "restartRun",
          {
            runId: "r1",
            templateFields: null,
          },
        ],
      );

      expect(state.runs["r1"].status).toBe("streaming");
      expect(state.runs["r1"]).not.toHaveProperty("mode");
      expect(state.activeRunId).toBe("r1");
      expect(state.messages[1]).toEqual({
        id: "assistant-r1",
        role: "assistant",
        parts: [{ type: "text", text: "" }],
        metadata: { kind: "chat-text", runId: "r1" },
      });
    });

    it("rewrites an error marker to chat-text when retrying", () => {
      const state = conversationReducer(
        {
          ...initialConversationState,
          runs: {
            r1: {
              id: "r1",
              status: "failed",
              cards: [],
              cardStatuses: {},
              templateFields: null,
              startedAt: new Date(0),
              elapsedSeconds: 1,
              error: { message: "boom" },
            },
          },
          messages: [
            {
              id: "user-r1",
              role: "user",
              parts: [{ type: "text", text: "Make cards" }],
              metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
            },
            {
              id: "assistant-r1",
              role: "assistant",
              parts: [{ type: "text", text: "" }],
              metadata: { kind: "error", runId: "r1" },
            },
          ],
        },
        ["restartRun", { runId: "r1", templateFields: null }],
      );

      expect(state.runs["r1"]).not.toHaveProperty("mode");
      expect(state.messages[1]?.metadata).toEqual({ kind: "chat-text", runId: "r1" });
    });

    it("updates templateFields on retry", () => {
      let state = reduce([
        [
          "submitTurn",
          {
            runId: "r1",
            text: "hello",
            kind: "chat-text",
            assistantText: "",
            templateFields: [{ id: 1, title: "Front", type: "text" as const, isRequired: true }],
          },
        ],
      ]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      const nextFields = [{ id: 2, title: "Back", type: "text" as const, isRequired: false }];
      state = conversationReducer(state, [
        "restartRun",
        {
          runId: "r1",
          templateFields: nextFields,
        },
      ]);

      expect(state.runs["r1"].templateFields).toEqual(nextFields);
    });

    it("overwrites modelName when a new value is provided", () => {
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "", modelName: "GPT-4" }],
      ]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      state = conversationReducer(state, [
        "restartRun",
        {
          runId: "r1",
          templateFields: null,
          modelName: "Claude",
        },
      ]);

      expect(state.runs["r1"].modelName).toBe("Claude");
    });

    it("preserves the existing modelName when restartRun omits it", () => {
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "", modelName: "GPT-4" }],
      ]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      state = conversationReducer(state, [
        "restartRun",
        {
          runId: "r1",
          templateFields: null,
        },
      ]);

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("preserves the existing modelName when restartRun sets it to undefined", () => {
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "", modelName: "GPT-4" }],
      ]);
      state = conversationReducer(state, ["completeRun", { runId: "r1" }]);

      state = conversationReducer(state, [
        "restartRun",
        {
          runId: "r1",
          templateFields: null,
          modelName: undefined,
        },
      ]);

      expect(state.runs["r1"].modelName).toBe("GPT-4");
    });

    it("uses the action's modelName when the run is missing", () => {
      const state = conversationReducer(initialConversationState, [
        "restartRun",
        {
          runId: "r1",
          templateFields: null,
          modelName: "Claude",
        },
      ]);

      expect(state.runs["r1"].modelName).toBe("Claude");
    });

    it("keeps the stored data access snapshot when the restart carries none", () => {
      const dataAccess: DataAccessSnapshot = { context: "User decks:", manifest: { decks: [], writeTarget: null } };
      let state = reduce([
        ["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "", dataAccess }],
      ]);
      state = conversationReducer(state, ["runFailed", { runId: "r1", error: { message: "boom" } }]);

      state = conversationReducer(state, ["restartRun", { runId: "r1", templateFields: null }]);

      expect(state.runs["r1"].dataAccess).toBe(dataAccess);
    });
  });

  describe("setUsage", () => {
    it("sets usage on the specified run", () => {
      let state = reduce([["submitTurn", { runId: "r1", text: "hello", kind: "chat-text", assistantText: "" }]]);
      const usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
      state = conversationReducer(state, ["setUsage", { runId: "r1", usage }]);
      expect(state.runs["r1"].usage).toEqual(usage);
    });
  });
});
