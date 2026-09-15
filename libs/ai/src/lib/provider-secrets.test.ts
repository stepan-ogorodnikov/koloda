import { describe, expect, it } from "vitest";
import {
  aiSecretsInputValidation,
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
    expect(issue?.message).toBe("validation.settings-ai.providers.base-url");
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
    expect(issue?.message).toBe("validation.settings-ai.providers.api-key");
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

  it("rejects on the input schema the blank key the wire schema normalizes", () => {
    // WHY: The save path must reject, not normalize — the twin of
    // `require_api_key_for_input` in domain/ai.rs. This is the exact desync the
    // wire schema cannot catch.
    const result = aiSecretsInputValidation.safeParse({ provider: "openrouter", apiKey: "" });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["apiKey"]);
    expect(issue?.message).toBe("validation.settings-ai.providers.api-key");
  });

  it.each([
    { provider: "openrouter" as const, secrets: { apiKey: null } },
    { provider: "opencodeGo" as const, secrets: { apiKey: "   " } },
    { provider: "opencodeZen" as const, secrets: {} },
    { provider: "ollamaCloud" as const, secrets: { apiKey: null } },
  ])("rejects a missing, blank, or null apiKey on the input schema for $provider", ({ provider, secrets }) => {
    const result = aiSecretsInputValidation.safeParse({ provider, ...secrets });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]?.message).toBe("validation.settings-ai.providers.api-key");
  });

  it("accepts keyed and keyless secrets on the input schema", () => {
    expect(aiSecretsInputValidation.parse({ provider: "openrouter", apiKey: "sk-or" })).toEqual({
      provider: "openrouter",
      apiKey: "sk-or",
    });
    expect(aiSecretsInputValidation.parse({ provider: "ollama", baseUrl: "http://localhost:11434" })).toEqual({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    });
    expect(
      aiSecretsInputValidation.parse({ provider: "lmstudio", baseUrl: "http://localhost:1234/v1", apiKey: "   " }),
    ).toEqual({ provider: "lmstudio", baseUrl: "http://localhost:1234/v1" });
  });
});
