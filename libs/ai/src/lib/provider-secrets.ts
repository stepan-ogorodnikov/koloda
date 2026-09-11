import { z } from "zod";

// WHY: Whitespace-only keys must fail the form schema to mirror the trim-based
// `require_api_key_for_input` check in `crates/koloda/src/domain/ai.rs`.
const requiredApiKey = z.string().trim().min(1, "validation.settings-ai.providers.apiKey");

/** Form/input schema: required non-blank key. */
export const openRouterSecretsValidation = z.object({
  apiKey: requiredApiKey,
});

export const ollamaSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
  apiKey: z.string().optional(),
});

export const lmstudioSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
  apiKey: z.string().optional(),
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
// Legacy `""` from older rows normalizes to `null` so missing-secret checks stay explicit.
const storedApiKey = z
  .union([z.string(), z.null()])
  .transform((value): string | null => (value === "" || value === null ? null : value));

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
  return apiKey != null && apiKey !== "";
}
