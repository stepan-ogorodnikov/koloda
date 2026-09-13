import { describe, expect, it } from "vitest";
import {
  aiSecretsValidation,
  isPresentApiKey,
  lmstudioSecretsValidation,
  ollamaCloudSecretsValidation,
  ollamaSecretsValidation,
  openRouterSecretsValidation,
  opencodeGoSecretsValidation,
  opencodeZenSecretsValidation,
} from "./provider-secrets";

describe("provider-secrets", () => {
  it("treats null, empty string, and whitespace-only as absent api keys", () => {
    expect(isPresentApiKey(null)).toBe(false);
    expect(isPresentApiKey(undefined)).toBe(false);
    expect(isPresentApiKey("")).toBe(false);
    expect(isPresentApiKey("   ")).toBe(false);
    expect(isPresentApiKey("sk-live")).toBe(true);
  });

  it("normalizes legacy empty apiKey to null on the wire schema", () => {
    const parsed = aiSecretsValidation.parse({ provider: "openrouter", apiKey: "" });
    expect(parsed).toEqual({ provider: "openrouter", apiKey: null });
  });

  it("normalizes whitespace-only apiKey to null on the wire schema", () => {
    // WHY: Twin of `deserialize_api_key` in domain/ai.rs — a whitespace-only key
    // must not survive a partial update as a present secret.
    const parsed = aiSecretsValidation.parse({ provider: "openrouter", apiKey: "   " });
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
    { label: "ollamaSecretsValidation empty", parse: () => ollamaSecretsValidation.safeParse({ baseUrl: "" }) },
    { label: "lmstudioSecretsValidation empty", parse: () => lmstudioSecretsValidation.safeParse({ baseUrl: "" }) },
    {
      label: "stored ollama",
      parse: () => aiSecretsValidation.safeParse({ provider: "ollama" as const, baseUrl: "not-a-url" }),
    },
    {
      label: "stored lmstudio",
      parse: () => aiSecretsValidation.safeParse({ provider: "lmstudio" as const, baseUrl: "not-a-url" }),
    },
    {
      label: "stored ollama empty",
      parse: () => aiSecretsValidation.safeParse({ provider: "ollama" as const, baseUrl: "" }),
    },
    {
      label: "stored lmstudio empty",
      parse: () => aiSecretsValidation.safeParse({ provider: "lmstudio" as const, baseUrl: "" }),
    },
  ])("rejects a non-URL baseUrl on $label", ({ parse }) => {
    const result = parse();
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["baseUrl"]);
    expect(issue?.message).toBe("validation.settings-ai.providers.baseUrl");
  });

  it.each([
    {
      label: "openRouterSecretsValidation",
      parse: () => openRouterSecretsValidation.safeParse({ apiKey: "   " }),
    },
    {
      label: "opencodeGoSecretsValidation",
      parse: () => opencodeGoSecretsValidation.safeParse({ apiKey: "   " }),
    },
    {
      label: "opencodeZenSecretsValidation",
      parse: () => opencodeZenSecretsValidation.safeParse({ apiKey: "   " }),
    },
    {
      label: "ollamaCloudSecretsValidation",
      parse: () => ollamaCloudSecretsValidation.safeParse({ apiKey: "   " }),
    },
  ])("rejects a whitespace-only apiKey on $label", ({ parse }) => {
    const result = parse();
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["apiKey"]);
    expect(issue?.message).toBe("validation.settings-ai.providers.apiKey");
  });

  it("accepts a non-blank apiKey on the form schema", () => {
    const parsed = openRouterSecretsValidation.parse({ apiKey: "sk-or" });
    expect(parsed).toEqual({ apiKey: "sk-or" });
  });

  it("treats a whitespace-only optional apiKey as absent on the ollama form schema", () => {
    // WHY: Rust's serde layer normalizes whitespace-only keys to `None`
    // (`deserialize_api_key` in domain/ai.rs), so the form schema must stay
    // equally lenient here and drop the value instead of preserving it.
    const parsed = ollamaSecretsValidation.parse({ baseUrl: "http://localhost:11434", apiKey: "   " });
    expect(parsed).toEqual({ baseUrl: "http://localhost:11434", apiKey: undefined });
  });
});
