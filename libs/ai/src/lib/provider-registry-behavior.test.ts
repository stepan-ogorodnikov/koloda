import { describe, expect, it } from "vitest";
import { AIError } from "./error";
import type { AiProvider } from "./provider-catalog";
import { getProviderConfig, listProvidersThatWorkInBrowser } from "./provider-registry";

describe("provider-registry", () => {
  it("rejects unknown providers with an AIError", () => {
    const unknownProvider = "bogus" as AiProvider;

    let thrown: unknown = null;
    try {
      getProviderConfig(unknownProvider);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AIError);
    expect(thrown as AIError).toMatchObject({
      code: "unknown",
      message: "Unsupported provider: bogus",
    });
  });

  it("lists the browser-capable providers per the spec platform table", () => {
    expect(listProvidersThatWorkInBrowser()).toEqual(["openrouter", "ollama", "lmstudio"]);
  });
});
