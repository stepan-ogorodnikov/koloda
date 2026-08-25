import { describe, expect, it } from "vitest";
import { AIError } from "./error";
import { AI_PROVIDERS } from "./provider-catalog";
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

  it("lists exactly the catalog entries whose own worksInBrowser flag is set", () => {
    const expected = AI_PROVIDERS.filter((id) => getProviderConfig(id).worksInBrowser);

    expect(listProvidersThatWorkInBrowser()).toEqual(expected);
  });
});
