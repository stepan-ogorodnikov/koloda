import { describe, expect, it } from "vitest";
import {
  aiSecretsValidation,
  isPresentApiKey,
  lmstudioSecretsValidation,
  ollamaSecretsValidation,
} from "./provider-secrets";

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

  it("accepts ollamaCloud api-key-only secrets on the wire schema", () => {
    const parsed = aiSecretsValidation.parse({ provider: "ollamaCloud", apiKey: "cloud-key" });
    expect(parsed).toEqual({ provider: "ollamaCloud", apiKey: "cloud-key" });
  });

  it.each([
    { label: "ollamaSecretsValidation", parse: () => ollamaSecretsValidation.safeParse({ baseUrl: "not-a-url" }) },
    { label: "lmstudioSecretsValidation", parse: () => lmstudioSecretsValidation.safeParse({ baseUrl: "not-a-url" }) },
    {
      label: "stored ollama",
      parse: () => aiSecretsValidation.safeParse({ provider: "ollama" as const, baseUrl: "not-a-url" }),
    },
    {
      label: "stored lmstudio",
      parse: () => aiSecretsValidation.safeParse({ provider: "lmstudio" as const, baseUrl: "not-a-url" }),
    },
  ])("rejects a non-URL baseUrl on $label", ({ parse }) => {
    const result = parse();
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["baseUrl"]);
    expect(issue?.message).toBe("validation.settings-ai.providers.baseUrl");
  });
});
