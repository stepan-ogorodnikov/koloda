import { z } from "zod";

export const AI_PROVIDER_LABELS = {
  openrouter: "OpenRouter",
  ollama: "Ollama",
  lmstudio: "LM Studio",
} as const;

export type AiProvider = keyof typeof AI_PROVIDER_LABELS;

export const AI_PROVIDERS = Object.keys(AI_PROVIDER_LABELS) as AiProvider[];

export const openRouterSecretsValidation = z.object({
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
});

export const ollamaSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
});

export const lmstudioSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
  apiKey: z.string().optional(),
});

export type AIPrompterSecrets =
  | z.infer<typeof openRouterSecretsValidation>
  | z.infer<typeof ollamaSecretsValidation>
  | z.infer<typeof lmstudioSecretsValidation>;

const secretsValidation = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("openrouter"), ...openRouterSecretsValidation.shape }),
  z.object({ provider: z.literal("ollama"), ...ollamaSecretsValidation.shape }),
  z.object({ provider: z.literal("lmstudio"), ...lmstudioSecretsValidation.shape }),
]);

export type AISecrets = z.infer<typeof secretsValidation>;

export const aiProfileValidation = z.object({
  id: z.uuid(),
  title: z.string().max(128, "validation.common.title.too-long").optional(),
  secrets: secretsValidation.optional(),
  lastUsedModel: z.string().optional(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export type AIProfile = z.input<typeof aiProfileValidation>;

export const aiSettingsValidation = z.object({
  profiles: z.array(aiProfileValidation),
});

export type AISettings = z.input<typeof aiSettingsValidation>;

export const DEFAULT_AI_SETTINGS: AISettings = aiSettingsValidation.parse({
  profiles: [],
});

export type AddAIProfileFormProps = {
  onSubmit: (data: { title?: string; secrets: AISecrets }) => void;
  isPending: boolean;
};

export type EditAIProfileFormProps = {
  profile: AIProfile;
  onSubmit: (data: { title?: string; secrets?: AISecrets }) => void;
  isPending: boolean;
};

export type AddAIProfileData = {
  title?: string;
  secrets?: AISecrets;
};

export type RemoveAIProfileData = {
  id: string;
};

export type UpdateAIProfileData = {
  id: string;
  title?: string;
  secrets?: AISecrets;
};

export type TouchAIProfileData = {
  id: string;
  modelId?: string;
};

export type AIProviderFieldConfig = {
  name: "apiKey" | "baseUrl";
  type: "password" | "url" | "text";
  required: boolean;
  placeholder?: string;
};

export const aiProfileFormSchema = z.object({
  title: z.string().max(128).optional(),
  provider: z.enum(["openrouter", "ollama", "lmstudio"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export type AIProfileFormValues = z.infer<typeof aiProfileFormSchema>;
