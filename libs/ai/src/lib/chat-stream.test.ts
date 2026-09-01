import { describe, expect, it } from "vitest";
import {
  ollamaProviderOptions,
  openRouterProviderOptions,
  opencodeGoProviderOptions,
  opencodeZenProviderOptions,
} from "./chat-stream";

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
