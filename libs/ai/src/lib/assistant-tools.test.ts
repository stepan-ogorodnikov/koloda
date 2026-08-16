import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AiSdkOllama from "ai-sdk-ollama";
import { ASSISTANT_TOOL_SPECS, bindAssistantTools } from "./assistant-tools";
import type { AssistantToolEvent } from "./assistant-tools";
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

  it("rejects unknown tool names at bind time", () => {
    expect(() => bindAssistantTools({ names: ["nope"], execute: vi.fn() })).toThrow(/Unknown assistant tool/);
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
