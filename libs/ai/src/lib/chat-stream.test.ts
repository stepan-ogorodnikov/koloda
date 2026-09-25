import { simulateReadableStream } from "ai";
import type * as Ai from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatStreamRequest } from "./generation";
import {
  deepseekProviderOptions,
  lmstudioProviderOptions,
  ollamaProviderOptions,
  streamChatWithOpenAI,
  streamChatWithDeepSeek,
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

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => () => fakeModel(),
}));

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: () => () => fakeModel(),
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
  it("sends OpenAI reasoningEffort through the OpenAI provider options", async () => {
    await streamChatWithOpenAI(chatRequest("high"), onChunk, abort, { apiKey: "k" });

    expect(streamTextCalls).toEqual([{ providerOptions: { openai: { reasoningEffort: "high" } } }]);
  });

  it("sends DeepSeek reasoningEffort through the DeepSeek provider options", async () => {
    await streamChatWithDeepSeek(chatRequest("high"), onChunk, abort, { apiKey: "k" });

    expect(streamTextCalls).toEqual([{ providerOptions: { deepseek: { reasoningEffort: "high" } } }]);
  });

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

  it("omits OpenAI providerOptions when effort is empty so the provider default still applies", async () => {
    await streamChatWithOpenAI(chatRequest(""), onChunk, abort, { apiKey: "k" });
    await streamChatWithOpenAI(chatRequest(undefined), onChunk, abort, { apiKey: "k" });

    expect(streamTextCalls.map((call) => call.providerOptions)).toEqual([undefined, undefined]);
  });
});

describe("deepseekProviderOptions", () => {
  it("maps generic reasoning efforts onto canonical DeepSeek values", () => {
    expect(deepseekProviderOptions("high")).toEqual({
      deepseek: { reasoningEffort: "high" },
    });
    expect(deepseekProviderOptions("medium")).toEqual({
      deepseek: { reasoningEffort: "high" },
    });
    expect(deepseekProviderOptions("xhigh")).toEqual({
      deepseek: { reasoningEffort: "max" },
    });
  });
});

describe("ollamaProviderOptions", () => {
  it("maps on/off onto boolean Ollama think", () => {
    expect(ollamaProviderOptions("on")).toEqual({ ollama: { think: true } });
    expect(ollamaProviderOptions("off")).toEqual({ ollama: { think: false } });
  });
});

describe("lmstudioProviderOptions", () => {
  it("maps a non-empty effort onto lmstudio reasoningEffort", () => {
    expect(lmstudioProviderOptions("high")).toEqual({
      lmstudio: { reasoningEffort: "high" },
    });
  });

  it("maps native off onto OpenAI-compatible none and on onto medium", () => {
    expect(lmstudioProviderOptions("off")).toEqual({
      lmstudio: { reasoningEffort: "none" },
    });
    expect(lmstudioProviderOptions("on")).toEqual({
      lmstudio: { reasoningEffort: "medium" },
    });
  });
});

describe("provider option helpers omit an empty effort", () => {
  it.each([
    ["DeepSeek", deepseekProviderOptions],
    ["opencode-go", opencodeGoProviderOptions],
    ["Ollama", ollamaProviderOptions],
    ["LM Studio", lmstudioProviderOptions],
    ["opencode-zen", opencodeZenProviderOptions],
  ] as const)("omits %s providerOptions when effort is missing or empty", (_label, providerOptions) => {
    expect(providerOptions(undefined)).toBeUndefined();
    expect(providerOptions("")).toBeUndefined();
  });
});
