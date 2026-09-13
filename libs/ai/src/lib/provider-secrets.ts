import { z } from "zod";

// WHY: Whitespace-only keys must fail the form schema to mirror the trim-based
// `require_api_key_for_input` check in `crates/koloda/src/domain/ai.rs`.
const requiredApiKey = z.string().trim().min(1, "validation.settings-ai.providers.apiKey");

// WHY: Optional keys treat whitespace as absent — the Rust serde layer normalizes
// whitespace-only keys to `None` (`deserialize_api_key` in domain/ai.rs), so the
// form schema must not preserve them either.
const optionalApiKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

/** Form/input schema: required non-blank key. */
export const openRouterSecretsValidation = z.object({
  apiKey: requiredApiKey,
});

export const ollamaSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
  apiKey: optionalApiKey,
});

export const lmstudioSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
  apiKey: optionalApiKey,
});

export const opencodeGoSecretsValidation = z.object({
  apiKey: requiredApiKey,
});

export const opencodeZenSecretsValidation = z.object({
  apiKey: requiredApiKey,
});

export const ollamaCloudSecretsValidation = z.object({
  apiKey: requiredApiKey,
});

// WHY: Settings / profile wire format uses `null` for redacted or absent keys.
// Legacy `""` and whitespace-only values normalize to `null` — the twin of
// `deserialize_api_key` in `crates/koloda/src/domain/ai.rs` — so missing-secret
// checks stay explicit and a partial update cannot keep a blank key alive.
const storedApiKey = z
  .union([z.string(), z.null()])
  .transform((value): string | null => (value === null || value.trim() === "" ? null : value));

export const aiSecretsValidation = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("openrouter"), apiKey: storedApiKey }),
  z.object({
    provider: z.literal("ollama"),
    baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
    apiKey: storedApiKey.optional(),
  }),
  z.object({
    provider: z.literal("lmstudio"),
    baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
    apiKey: storedApiKey.optional(),
  }),
  z.object({ provider: z.literal("opencodeGo"), apiKey: storedApiKey }),
  z.object({ provider: z.literal("opencodeZen"), apiKey: storedApiKey }),
  z.object({ provider: z.literal("ollamaCloud"), apiKey: storedApiKey }),
]);

export type AISecrets = z.infer<typeof aiSecretsValidation>;

export type SecretField = "apiKey" | "baseUrl";

export function isPresentApiKey(apiKey: string | null | undefined): apiKey is string {
  // WHY: Whitespace-only keys count as absent so legacy rows surface as keyless
  // instead of sending blank credentials — the twin of the keyring trim check in
  // `crates/koloda/src/repo/ai.rs`.
  return apiKey != null && apiKey.trim() !== "";
}
