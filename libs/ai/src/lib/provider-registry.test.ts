import { describe, expect, it } from "vitest";
import { AI_PROVIDERS } from "./provider-catalog";
import { AI_PROVIDER_REGISTRY, getProviderConfig, listProvidersThatWorkInBrowser } from "./provider-registry";

describe("provider-registry", () => {
  it("lists only providers whose HTTP APIs work from a page origin", () => {
    expect(listProvidersThatWorkInBrowser()).toEqual(["openrouter", "ollama", "lmstudio"]);
  });

  it("marks every catalog provider with worksInBrowser", () => {
    for (const id of AI_PROVIDERS) {
      expect(typeof AI_PROVIDER_REGISTRY[id].worksInBrowser).toBe("boolean");
      expect(getProviderConfig(id).id).toBe(id);
    }
  });
});
