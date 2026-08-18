import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AiSdkOllama from "ai-sdk-ollama";
import { ASSISTANT_TOOL_MAX_CARDS_PER_DECK, ASSISTANT_TOOL_SPECS, bindAssistantTools } from "./assistant-tools";
import type {
  AssistantToolCard,
  AssistantToolEvent,
  AssistantToolTemplate,
  ProposeCardsOutput,
} from "./assistant-tools";
import {
  generatedCardsFromProposeOutput,
  isProposeCardsOutput,
  shapeGetDeckCardsOutput,
  shapeListDecksOutput,
  shapeProposeCardsOutput,
} from "./assistant-tools";
import { streamChatWithOllama } from "./chat-stream";
import type { ChatStreamRequest } from "./generation";

// WHY: streamChatWithOllama builds its model via createOllama; swapping the factory
// lets the real streamText run against a fake model for a genuine tool round-trip.
const fakeModelSlot = vi.hoisted(() => ({ model: null as MockLanguageModelV3 | null }));

vi.mock("ai-sdk-ollama", () => ({
  createOllama: (() => (_modelId: string) => {
    if (fakeModelSlot.model == null) throw new Error("fake model not installed");
    return fakeModelSlot.model;
  }) as unknown as typeof AiSdkOllama.createOllama,
}));

const OLLAMA_OPTIONS = { baseUrl: "http://localhost:11434" };

function usage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
  };
}

// WHY: derived from the mock itself — @ai-sdk/provider is a transitive dep, not ours to import.
type MockStreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;
type MockStreamChunk = MockStreamResult["stream"] extends ReadableStream<infer TChunk> ? TChunk : never;

function streamOf(chunks: MockStreamChunk[]): MockStreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function createChatRequest(overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest {
  return {
    messages: [{ role: "user", content: "List my decks" }],
    input: { modelId: "llama3", prompt: "List my decks" },
    ...overrides,
  };
}

/** First call asks for a tool; later calls answer with text. */
function createToolRoundTripModel() {
  let callCount = 0;
  return new MockLanguageModelV3({
    doStream: async (): Promise<MockStreamResult> => {
      callCount += 1;
      if (callCount === 1) {
        return streamOf([
          { type: "tool-call", toolCallId: "call-1", toolName: "list_decks", input: JSON.stringify({}) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage: usage(3, 5) },
        ]);
      }
      // Distinct usage so summed totals prove accumulation across steps.
      return textOnlyChunks(usage(30, 50));
    },
  });
}

function createTextOnlyModel() {
  return new MockLanguageModelV3({
    doStream: async (): Promise<MockStreamResult> => textOnlyChunks(),
  });
}

/** First call asks for a tool; the answer step hangs mid-text until aborted. */
function createAbortDuringAnswerModel() {
  let callCount = 0;
  return new MockLanguageModelV3({
    doStream: async ({ abortSignal }): Promise<MockStreamResult> => {
      callCount += 1;
      if (callCount === 1) {
        return streamOf([
          { type: "tool-call", toolCallId: "call-1", toolName: "list_decks", input: JSON.stringify({}) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage: usage(3, 5) },
        ]);
      }
      // Mimics a provider streaming partial text whose in-flight request only
      // settles (with an AbortError) once the signal fires.
      return {
        stream: new ReadableStream<MockStreamChunk>({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text-1" });
            controller.enqueue({ type: "text-delta", id: "text-1", delta: "Partial " });
            abortSignal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), {
              once: true,
            });
          },
        }),
      };
    },
  });
}

function textOnlyChunks(stepUsage = usage(3, 5)): MockStreamResult {
  return streamOf([
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "You have " },
    { type: "text-delta", id: "text-1", delta: "2 decks." },
    { type: "text-end", id: "text-1" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: stepUsage },
  ]);
}

function toolResultOutputsOf(call: number, model: MockLanguageModelV3): unknown[] {
  const prompt = model.doStreamCalls[call]?.prompt ?? [];
  return prompt
    .filter((message) => message.role === "tool")
    .flatMap((message) => (message as { content: Array<{ type: string; output?: unknown }> }).content)
    .filter((part) => part.type === "tool-result")
    .map((part) => part.output);
}

describe("assistant-tools binder", () => {
  it("binds only the requested specs with model-facing descriptions", () => {
    const bound = bindAssistantTools({ names: ["get_deck_cards"], execute: vi.fn() });

    expect(Object.keys(bound)).toEqual(["get_deck_cards"]);
    expect(bound.get_deck_cards?.description).toBe(ASSISTANT_TOOL_SPECS.get_deck_cards.description);
  });

  it("binds propose_cards as a known spec", () => {
    const bound = bindAssistantTools({ names: ["propose_cards"], execute: vi.fn() });

    expect(ASSISTANT_TOOL_SPECS.propose_cards).toBeDefined();
    expect(Object.keys(bound)).toEqual(["propose_cards"]);
    expect(bound.propose_cards?.description).toBe(ASSISTANT_TOOL_SPECS.propose_cards.description);
  });

  it("rejects unknown tool names at bind time", () => {
    expect(() => bindAssistantTools({ names: ["nope"], execute: vi.fn() })).toThrow(/Unknown assistant tool/);
  });
});

describe("tool output shaping", () => {
  const templates: AssistantToolTemplate[] = [
    {
      id: 1,
      title: "Basic",
      content: {
        fields: [
          { id: 10, title: "Front", type: "text", isRequired: true },
          { id: 11, title: "Back", type: "text", isRequired: true },
        ],
      },
    },
    { id: 2, title: "Cloze", content: { fields: [{ id: 20, title: "Text", type: "text", isRequired: true }] } },
  ];
  const deck = { id: 5, title: "Spanish verbs", template: templates[0] };

  /** Card content is keyed by field id as a string, mirroring the persisted shape. */
  function card(texts: Record<number, string>): AssistantToolCard {
    return {
      content: Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, { text }])),
    };
  }

  it("maps deck rows to list_decks output with template titles and field titles", () => {
    const output = shapeListDecksOutput(
      [
        { id: 5, title: "Spanish verbs", templateId: 1, cardCount: 12 },
        { id: 6, title: "Orphan", templateId: 99, cardCount: 0 },
      ],
      templates,
    );

    expect(output).toEqual({
      decks: [
        { deckId: 5, title: "Spanish verbs", cardCount: 12, templateTitle: "Basic", fieldTitles: ["Front", "Back"] },
        { deckId: 6, title: "Orphan", cardCount: 0, templateTitle: null, fieldTitles: [] },
      ],
    });
  });

  it("returns an empty deck list for empty inputs", () => {
    expect(shapeListDecksOutput([], templates)).toEqual({ decks: [] });
  });

  it("lists every card of a small deck and maps field ids to titles", () => {
    const cards = [card({ 10: "hola", 11: "hello" }), card({ 10: "gato", 11: "cat" })];

    expect(shapeGetDeckCardsOutput(deck, cards)).toEqual({
      deckTitle: "Spanish verbs",
      totalCards: 2,
      isCapped: false,
      cards: [{ fields: { Front: "hola", Back: "hello" } }, { fields: { Front: "gato", Back: "cat" } }],
    });
  });

  it("maps a field missing from card content to empty text", () => {
    expect(shapeGetDeckCardsOutput(deck, [card({ 10: "hola" })])).toEqual({
      deckTitle: "Spanish verbs",
      totalCards: 1,
      isCapped: false,
      cards: [{ fields: { Front: "hola", Back: "" } }],
    });
  });

  it("returns no cards for an empty deck without flagging it capped", () => {
    expect(shapeGetDeckCardsOutput(deck, [])).toEqual({
      deckTitle: "Spanish verbs",
      totalCards: 0,
      isCapped: false,
      cards: [],
    });
  });

  it(`caps the card list at ${ASSISTANT_TOOL_MAX_CARDS_PER_DECK} while reporting the true total`, () => {
    // WHY: single short field keeps every entry far under the char budget, so the
    // only truncation source in this test is the per-deck cap.
    const cappedDeck = { id: 7, title: "Numbers", template: templates[1] };
    const cards = Array.from({ length: ASSISTANT_TOOL_MAX_CARDS_PER_DECK + 5 }, (_unused, index) =>
      card({ 20: `n${index}` }),
    );

    const output = shapeGetDeckCardsOutput(cappedDeck, cards);

    expect(output.totalCards).toBe(ASSISTANT_TOOL_MAX_CARDS_PER_DECK + 5);
    expect(output.cards).toHaveLength(ASSISTANT_TOOL_MAX_CARDS_PER_DECK);
    expect(output.cards[0]).toEqual({ fields: { Text: "n0" } });
    expect(output.cards[ASSISTANT_TOOL_MAX_CARDS_PER_DECK - 1]).toEqual({
      fields: { Text: `n${ASSISTANT_TOOL_MAX_CARDS_PER_DECK - 1}` },
    });
    expect(output.isCapped).toBe(true);
  });

  it("truncates within the serialized char budget before the cap is reached", () => {
    // WHY: each entry serializes to ~7.1k chars, so the second never fits the
    // 8k budget — truncation comes from the budget, not the 200-card cap.
    const bigText = "x".repeat(3_500);
    const cards = [
      card({ 10: bigText, 11: bigText }),
      card({ 10: bigText, 11: bigText }),
      card({ 10: "small", 11: "tiny" }),
    ];

    const output = shapeGetDeckCardsOutput(deck, cards);

    expect(output.totalCards).toBe(3);
    expect(output.cards).toEqual([{ fields: { Front: bigText, Back: bigText } }]);
    expect(output.isCapped).toBe(true);
  });
});

describe("propose_cards output shaping", () => {
  const template: AssistantToolTemplate = {
    id: 1,
    title: "Basic",
    content: {
      fields: [
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "text", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ],
    },
  };
  const deck = { id: 5, title: "Spanish verbs", template };

  it("maps titles onto template field ids and returns title-keyed accepted cards", () => {
    expect(shapeProposeCardsOutput(deck, [{ fields: { Front: "hola", Back: "hello", Hint: "greeting" } }])).toEqual({
      deckId: 5,
      deckTitle: "Spanish verbs",
      templateFields: [
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "text", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ],
      cards: [{ fields: { Front: "hola", Back: "hello", Hint: "greeting" } }],
      rejectedCount: 0,
    });
  });

  it("drops all-empty cards", () => {
    const output = shapeProposeCardsOutput(deck, [
      { fields: { Front: "hola", Back: "hello" } },
      { fields: { Front: "  ", Back: "", Hint: "   " } },
      { fields: {} },
    ]);

    expect(output.cards).toEqual([{ fields: { Front: "hola", Back: "hello", Hint: "" } }]);
    expect(output.rejectedCount).toBe(2);
  });

  it("drops cards missing required fields", () => {
    const output = shapeProposeCardsOutput(deck, [
      { fields: { Front: "hola", Hint: "greeting" } },
      { fields: { Front: "gato", Back: "cat" } },
    ]);

    expect(output.cards).toEqual([{ fields: { Front: "gato", Back: "cat", Hint: "" } }]);
    expect(output.rejectedCount).toBe(1);
  });

  it("ignores unknown field titles", () => {
    const output = shapeProposeCardsOutput(deck, [{ fields: { Front: "hola", Back: "hello", Extra: "nope" } }]);

    expect(output.cards).toEqual([{ fields: { Front: "hola", Back: "hello", Hint: "" } }]);
    expect(output.rejectedCount).toBe(0);
  });

  it("returns an empty accepted list for empty input without rejecting", () => {
    expect(shapeProposeCardsOutput(deck, [])).toEqual({
      deckId: 5,
      deckTitle: "Spanish verbs",
      templateFields: [
        { id: 10, title: "Front", type: "text", isRequired: true },
        { id: 11, title: "Back", type: "text", isRequired: true },
        { id: 12, title: "Hint", type: "text", isRequired: false },
      ],
      cards: [],
      rejectedCount: 0,
    });
  });

  it(`caps accepted cards at ${ASSISTANT_TOOL_MAX_CARDS_PER_DECK} and counts extras as rejected`, () => {
    const cards = Array.from({ length: ASSISTANT_TOOL_MAX_CARDS_PER_DECK + 5 }, (_unused, index) => ({
      fields: { Front: `f${index}`, Back: `b${index}` },
    }));

    const output = shapeProposeCardsOutput(deck, cards);

    expect(output.cards).toHaveLength(ASSISTANT_TOOL_MAX_CARDS_PER_DECK);
    expect(output.rejectedCount).toBe(5);
    expect(output.cards[0]).toEqual({ fields: { Front: "f0", Back: "b0", Hint: "" } });
    expect(output.cards[ASSISTANT_TOOL_MAX_CARDS_PER_DECK - 1]).toEqual({
      fields: {
        Front: `f${ASSISTANT_TOOL_MAX_CARDS_PER_DECK - 1}`,
        Back: `b${ASSISTANT_TOOL_MAX_CARDS_PER_DECK - 1}`,
        Hint: "",
      },
    });
  });

  it("carries isRequired from the source template onto output fields", () => {
    const output = shapeProposeCardsOutput(deck, [{ fields: { Front: "hola", Back: "hello" } }]);

    expect(output.templateFields).toEqual([
      { id: 10, title: "Front", type: "text", isRequired: true },
      { id: 11, title: "Back", type: "text", isRequired: true },
      { id: 12, title: "Hint", type: "text", isRequired: false },
    ]);
  });

  it("carries type: markdown from the source template onto output fields", () => {
    const markdownDeck = {
      id: 5,
      title: "Spanish verbs",
      template: {
        id: 1,
        title: "Basic",
        content: {
          fields: [
            { id: 10, title: "Front", type: "text" as const, isRequired: true },
            { id: 11, title: "Back", type: "markdown" as const, isRequired: true },
          ],
        },
      },
    };

    const output = shapeProposeCardsOutput(markdownDeck, [{ fields: { Front: "hola", Back: "**hello**" } }]);

    expect(output.templateFields).toEqual([
      { id: 10, title: "Front", type: "text", isRequired: true },
      { id: 11, title: "Back", type: "markdown", isRequired: true },
    ]);
    expect(isProposeCardsOutput(output)).toBe(true);
  });
});

describe("propose_cards output guard and mapper", () => {
  const validOutput: ProposeCardsOutput = {
    deckId: 5,
    deckTitle: "Spanish verbs",
    templateFields: [
      { id: 10, title: "Front", type: "text", isRequired: true },
      { id: 11, title: "Back", type: "text", isRequired: true },
      { id: 12, title: "Hint", type: "text", isRequired: false },
    ],
    cards: [{ fields: { Front: "hola", Back: "hello", Hint: "greeting" } }],
    rejectedCount: 0,
  };

  it("accepts a shaped propose_cards payload", () => {
    const deck = {
      id: 5,
      title: "Spanish verbs",
      template: {
        id: 1,
        title: "Basic",
        content: {
          fields: [
            { id: 10, title: "Front", type: "text" as const, isRequired: true },
            { id: 11, title: "Back", type: "text" as const, isRequired: true },
            { id: 12, title: "Hint", type: "text" as const, isRequired: false },
          ],
        },
      },
    };

    expect(isProposeCardsOutput(validOutput)).toBe(true);
    expect(isProposeCardsOutput(shapeProposeCardsOutput(deck, [{ fields: { Front: "hola", Back: "hello" } }]))).toBe(
      true,
    );
  });

  it("rejects malformed payloads", () => {
    expect(isProposeCardsOutput(undefined)).toBe(false);
    expect(isProposeCardsOutput(null)).toBe(false);
    expect(isProposeCardsOutput({ decks: [] })).toBe(false);
    expect(isProposeCardsOutput({ ...validOutput, deckId: 0 })).toBe(false);
    expect(isProposeCardsOutput({ ...validOutput, deckId: 1.5 })).toBe(false);
    expect(isProposeCardsOutput({ ...validOutput, rejectedCount: 1.5 })).toBe(false);
    expect(
      isProposeCardsOutput({
        ...validOutput,
        templateFields: [{ id: 10, title: "Front" }],
      }),
    ).toBe(false);
    expect(
      isProposeCardsOutput({
        ...validOutput,
        templateFields: [{ id: 10, title: "Front", isRequired: true }],
      }),
    ).toBe(false);
    expect(
      isProposeCardsOutput({
        ...validOutput,
        templateFields: [{ id: 10, title: "Front", type: "html", isRequired: true }],
      }),
    ).toBe(false);
    expect(
      isProposeCardsOutput({
        ...validOutput,
        cards: [{ fields: { Front: 1 } }],
      }),
    ).toBe(false);
  });

  it("maps title-keyed accepted cards onto id-keyed GeneratedCard content", () => {
    expect(generatedCardsFromProposeOutput(validOutput)).toEqual([
      { content: { "10": { text: "hola" }, "11": { text: "hello" }, "12": { text: "greeting" } } },
    ]);
  });

  it("fills missing titles with empty text and ignores unknown titles", () => {
    expect(
      generatedCardsFromProposeOutput({
        ...validOutput,
        cards: [{ fields: { Front: "hola", Extra: "nope" } }],
      }),
    ).toEqual([{ content: { "10": { text: "hola" }, "11": { text: "" }, "12": { text: "" } } }]);
  });

  it("returns an empty list when no cards were accepted", () => {
    expect(generatedCardsFromProposeOutput({ ...validOutput, cards: [] })).toEqual([]);
  });
});

describe("chat tool streaming", () => {
  beforeEach(() => {
    fakeModelSlot.model = null;
  });

  it("round-trips a tool call through a fake model and executor", async () => {
    const model = createToolRoundTripModel();
    fakeModelSlot.model = model;
    const listDecksOutput = {
      decks: [
        { deckId: 1, title: "Spanish verbs", cardCount: 12, templateTitle: "Basic", fieldTitles: ["Front", "Back"] },
      ],
    };
    const executeTool = vi.fn().mockResolvedValue(listDecksOutput);
    const events: AssistantToolEvent[] = [];
    const onChunk = vi.fn();

    const result = await streamChatWithOllama(
      createChatRequest({
        tools: ["list_decks"],
        executeTool,
        onToolEvent: (event) => events.push(event),
      }),
      onChunk,
      new AbortController().signal,
      OLLAMA_OPTIONS,
    );

    // The binder dispatched to the host executor with the parsed input...
    expect(executeTool).toHaveBeenCalledWith("list_decks", {});
    // ...the result streamed back to the model as the second step's tool message...
    expect(model.doStreamCalls).toHaveLength(2);
    expect(toolResultOutputsOf(1, model)).toEqual([{ type: "json", value: listDecksOutput }]);
    // ...and the final text arrived after the tool traffic, in order.
    expect(onChunk.mock.calls).toEqual([["You have "], ["2 decks."]]);
    expect(events).toEqual([
      { kind: "toolCall", call: { id: "call-1", name: "list_decks", input: {} } },
      { kind: "toolResult", callId: "call-1", output: listDecksOutput },
    ]);
    // Steps reported 3/5 then 30/50; the run must return the accumulated total.
    expect(result).toMatchObject({ promptTokens: 33, completionTokens: 55, totalTokens: 88 });
  });

  it("keeps text output and single-step behavior when no tools are requested", async () => {
    const model = createTextOnlyModel();
    fakeModelSlot.model = model;
    const onChunk = vi.fn();
    const onToolEvent = vi.fn();

    await streamChatWithOllama(
      createChatRequest({ onToolEvent: (event) => onToolEvent(event) }),
      onChunk,
      new AbortController().signal,
      OLLAMA_OPTIONS,
    );

    expect(onChunk.mock.calls).toEqual([["You have "], ["2 decks."]]);
    expect(onToolEvent).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.tools).toBeUndefined();
  });

  it("aborts cleanly mid-tool-run when the executor honors the abort signal", async () => {
    const controller = new AbortController();
    const model = new MockLanguageModelV3({
      doStream: async ({ abortSignal }): Promise<MockStreamResult> => {
        // Mimics a provider whose in-flight request rejects once the signal fires.
        if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        return streamOf([
          { type: "tool-call", toolCallId: "call-1", toolName: "get_deck_cards", input: JSON.stringify({ deckId: 7 }) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage: usage(3, 5) },
        ]);
      },
    });
    fakeModelSlot.model = model;
    const events: AssistantToolEvent[] = [];
    // The executor hangs like an in-flight query and settles only on abort.
    const executeTool = vi.fn(
      () =>
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
            once: true,
          });
        }),
    );
    const onToolEvent = (event: AssistantToolEvent) => {
      events.push(event);
      // Abort once the toolCall part has been delivered, so the run is cut mid-tool.
      if (event.kind === "toolCall") controller.abort();
    };

    // WHY: with no completed step recorded, the SDK rejects usage with the abort
    // reason; the stream must surface it unwrapped so callers can classify cancel.
    const error = await streamChatWithOllama(
      createChatRequest({ tools: ["get_deck_cards"], executeTool, onToolEvent }),
      vi.fn(),
      controller.signal,
      OLLAMA_OPTIONS,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
    expect(executeTool).toHaveBeenCalledWith("get_deck_cards", { deckId: 7 });
    expect(events).toEqual([
      { kind: "toolCall", call: { id: "call-1", name: "get_deck_cards", input: { deckId: 7 } } },
    ]);
  });

  it("rejects with an AbortError when aborted after a completed tool step", async () => {
    const controller = new AbortController();
    const model = createAbortDuringAnswerModel();
    fakeModelSlot.model = model;
    const executeTool = vi.fn().mockResolvedValue({ decks: [] });
    const onChunk = vi.fn(() => {
      // Cancel while the post-tool answer text is streaming (a step already completed).
      controller.abort();
    });

    // WHY: with a completed step on record, the SDK resolves (not rejects) on abort —
    // only the fullStream's `abort` part reveals the cancel. The run must still reject
    // so callers classify it as canceled, while the partial text stays delivered.
    const error = await streamChatWithOllama(
      createChatRequest({ tools: ["list_decks"], executeTool }),
      onChunk,
      controller.signal,
      OLLAMA_OPTIONS,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
    expect(model.doStreamCalls).toHaveLength(2);
    expect(onChunk).toHaveBeenCalledWith("Partial ");
  });
});
