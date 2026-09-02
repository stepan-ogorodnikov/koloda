import { simulateReadableStream } from "ai";
import type * as Ai from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatStreamRequest } from "./generation";
import {
  lmstudioProviderOptions,
  ollamaProviderOptions,
  openRouterProviderOptions,
  opencodeGoProviderOptions,
  opencodeZenProviderOptions,
  streamChatWithLMStudio,
  streamChatWithOllama,
  streamChatWithOllamaCloud,
  streamChatWithOpenRouter,
  streamChatWithOpencodeGo,
  streamChatWithOpencodeZen,
} from "./chat-stream";

const { fakeModelSlot, streamTextCalls } = vi.hoisted(() => ({
  fakeModelSlot: { model: null as MockLanguageModelV3 | null },
  streamTextCalls: [] as Array<{ providerOptions?: unknown }>,
}));

function fakeModel() {
  if (fakeModelSlot.model == null) throw new Error("fake model not installed");
  return fakeModelSlot.model;
}

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return {
    ...actual,
    streamText: ((...args: Parameters<typeof actual.streamText>) => {
      streamTextCalls.push({ providerOptions: args[0]?.providerOptions });
      return actual.streamText(...args);
    }) as typeof actual.streamText,
  };
});

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => fakeModel(),
}));

vi.mock("ai-sdk-ollama", () => ({
  createOllama: () => () => fakeModel(),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => () => fakeModel(),
}));

afterEach(() => {
  fakeModelSlot.model = null;
  streamTextCalls.length = 0;
});

beforeEach(() => {
  fakeModelSlot.model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "ok" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
});

function chatRequest(reasoningEffort?: string): ChatStreamRequest {
  return {
    messages: [{ role: "user", content: "Hi" }],
    input: { modelId: "test-model", reasoningEffort },
  };
}

const abort = new AbortController().signal;
const onChunk = () => undefined;

describe("stream wrappers pass reasoning effort into streamText", () => {
  it("sends OpenRouter reasoning.effort and OpenCode reasoningEffort", async () => {
    await streamChatWithOpenRouter(chatRequest("high"), onChunk, abort, { apiKey: "k" });
    await streamChatWithOpencodeGo(chatRequest("high"), onChunk, abort, { apiKey: "k" });
    await streamChatWithOpencodeZen(chatRequest("high"), onChunk, abort, { apiKey: "k" });

    expect(streamTextCalls.map((call) => call.providerOptions)).toEqual([
      { openrouter: { reasoning: { effort: "high" } } },
      { "opencode-go": { reasoningEffort: "high" } },
      { "opencode-zen": { reasoningEffort: "high" } },
    ]);
  });

  it("sends Ollama think and LM Studio reasoningEffort, mapping off to none", async () => {
    await streamChatWithOllama(chatRequest("high"), onChunk, abort, { baseUrl: "http://localhost:11434" });
    await streamChatWithOllamaCloud(chatRequest("high"), onChunk, abort, { apiKey: "k" });
    await streamChatWithLMStudio(chatRequest("off"), onChunk, abort, { baseUrl: "http://localhost:1234/v1" });

    expect(streamTextCalls.map((call) => call.providerOptions)).toEqual([
      { ollama: { think: "high" } },
      { ollama: { think: "high" } },
      { lmstudio: { reasoningEffort: "none" } },
    ]);
  });

  it("omits providerOptions when OpenRouter effort is empty so the provider default still applies", async () => {
    await streamChatWithOpenRouter(chatRequest(""), onChunk, abort, { apiKey: "k" });
    await streamChatWithOpenRouter(chatRequest(undefined), onChunk, abort, { apiKey: "k" });

    expect(streamTextCalls.map((call) => call.providerOptions)).toEqual([undefined, undefined]);
  });
});

describe("openRouterProviderOptions", () => {
  it("maps a non-empty effort onto OpenRouter reasoning.effort", () => {
    expect(openRouterProviderOptions("high")).toEqual({
      openrouter: { reasoning: { effort: "high" } },
    });
  });

  it("omits providerOptions when effort is missing or empty", () => {
    expect(openRouterProviderOptions(undefined)).toBeUndefined();
    expect(openRouterProviderOptions("")).toBeUndefined();
  });
});

describe("opencodeGoProviderOptions", () => {
  it("maps a non-empty effort onto opencode-go reasoningEffort", () => {
    expect(opencodeGoProviderOptions("high")).toEqual({
      "opencode-go": { reasoningEffort: "high" },
    });
  });

  it("omits providerOptions when effort is missing or empty", () => {
    expect(opencodeGoProviderOptions(undefined)).toBeUndefined();
    expect(opencodeGoProviderOptions("")).toBeUndefined();
  });
});

describe("ollamaProviderOptions", () => {
  it("maps a non-empty effort onto Ollama think", () => {
    expect(ollamaProviderOptions("high")).toEqual({
      ollama: { think: "high" },
    });
  });

  it("omits providerOptions when effort is missing or empty", () => {
    expect(ollamaProviderOptions(undefined)).toBeUndefined();
    expect(ollamaProviderOptions("")).toBeUndefined();
  });
});

describe("lmstudioProviderOptions", () => {
  it("maps a non-empty effort onto lmstudio reasoningEffort", () => {
    expect(lmstudioProviderOptions("high")).toEqual({
      lmstudio: { reasoningEffort: "high" },
    });
  });

  it("maps native off onto OpenAI-compatible none", () => {
    expect(lmstudioProviderOptions("off")).toEqual({
      lmstudio: { reasoningEffort: "none" },
    });
  });

  it("omits providerOptions when effort is missing or empty", () => {
    expect(lmstudioProviderOptions(undefined)).toBeUndefined();
    expect(lmstudioProviderOptions("")).toBeUndefined();
  });
});

describe("opencodeZenProviderOptions", () => {
  it("maps a non-empty effort onto opencode-zen reasoningEffort", () => {
    expect(opencodeZenProviderOptions("high")).toEqual({
      "opencode-zen": { reasoningEffort: "high" },
    });
  });

  it("omits providerOptions when effort is missing or empty", () => {
    expect(opencodeZenProviderOptions(undefined)).toBeUndefined();
    expect(opencodeZenProviderOptions("")).toBeUndefined();
  });
});
