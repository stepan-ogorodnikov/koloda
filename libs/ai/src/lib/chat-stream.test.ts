import { describe, expect, it } from "vitest";
import {
  deepseekProviderOptions,
  lmstudioProviderOptions,
  ollamaProviderOptions,
  openAIProviderOptions,
  openRouterProviderOptions,
  opencodeGoProviderOptions,
  opencodeZenProviderOptions,
} from "./chat-stream";

describe("provider option helpers pass a non-empty effort through", () => {
  it.each([
    ["OpenAI", openAIProviderOptions, { openai: { reasoningEffort: "high", reasoningSummary: null } }],
    ["OpenRouter", openRouterProviderOptions, { openrouter: { reasoning: { effort: "high" } } }],
    ["opencode-go", opencodeGoProviderOptions, { "opencode-go": { reasoningEffort: "high" } }],
    ["opencode-zen", opencodeZenProviderOptions, { "opencode-zen": { reasoningEffort: "high" } }],
    ["Ollama", ollamaProviderOptions, { ollama: { think: "high" } }],
  ] as const)("maps %s high onto provider options", (_label, providerOptions, expected) => {
    expect(providerOptions("high")).toEqual(expected);
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
    ["OpenAI", openAIProviderOptions],
    ["OpenRouter", openRouterProviderOptions],
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
