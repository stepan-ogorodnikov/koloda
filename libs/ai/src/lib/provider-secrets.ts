import { z } from "zod";

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

export const aiSecretsValidation = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("openrouter"), ...openRouterSecretsValidation.shape }),
  z.object({ provider: z.literal("ollama"), ...ollamaSecretsValidation.shape }),
  z.object({ provider: z.literal("lmstudio"), ...lmstudioSecretsValidation.shape }),
  z.object({ provider: z.literal("opencodeGo"), ...opencodeGoSecretsValidation.shape }),
  z.object({ provider: z.literal("opencodeZen"), ...opencodeZenSecretsValidation.shape }),
]);

export type AISecrets = z.infer<typeof aiSecretsValidation>;

export type SecretField = "apiKey" | "baseUrl";
