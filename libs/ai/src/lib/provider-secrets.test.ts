import { describe, expect, it } from "vitest";
import { aiSecretsValidation, isPresentApiKey } from "./provider-secrets";

describe("provider-secrets", () => {
  it("treats null and empty string as absent api keys", () => {
    expect(isPresentApiKey(null)).toBe(false);
    expect(isPresentApiKey(undefined)).toBe(false);
    expect(isPresentApiKey("")).toBe(false);
    expect(isPresentApiKey("sk-live")).toBe(true);
  });

  it("normalizes legacy empty apiKey to null on the wire schema", () => {
    const parsed = aiSecretsValidation.parse({ provider: "openrouter", apiKey: "" });
    expect(parsed).toEqual({ provider: "openrouter", apiKey: null });
  });

  it("keeps null apiKey on the wire schema", () => {
    const parsed = aiSecretsValidation.parse({ provider: "openrouter", apiKey: null });
    expect(parsed).toEqual({ provider: "openrouter", apiKey: null });
  });
});
