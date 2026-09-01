import { describe, expect, it } from "vitest";
import { openRouterProviderOptions } from "./chat-stream";

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
