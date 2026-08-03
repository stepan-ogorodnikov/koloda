import { z } from "zod";

/** Form/input schema: required non-empty key. */
export const openRouterSecretsValidation = z.object({
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
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
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
});

export const opencodeZenSecretsValidation = z.object({
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
});

export type AIPrompterSecrets =
  | z.infer<typeof openRouterSecretsValidation>
  | z.infer<typeof ollamaSecretsValidation>
  | z.infer<typeof lmstudioSecretsValidation>
  | z.infer<typeof opencodeGoSecretsValidation>
  | z.infer<typeof opencodeZenSecretsValidation>;

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
]);

export type AISecrets = z.infer<typeof aiSecretsValidation>;

export type SecretField = "apiKey" | "baseUrl";

export function isPresentApiKey(apiKey: string | null | undefined): apiKey is string {
  return apiKey != null && apiKey !== "";
}
