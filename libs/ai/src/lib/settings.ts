import { z } from "zod";
import { type AISecrets, aiSecretsValidation } from "./provider-secrets";

export const aiProfileValidation = z.object({
  id: z.uuid(),
  title: z.string().max(128, "validation.common.title.too-long").optional(),
  secrets: aiSecretsValidation.optional(),
  createdAt: z.iso.datetime(),
});

export type AIProfile = z.output<typeof aiProfileValidation>;

export const assistantSettingsValidation = z.object({
  temperature: z.number().min(0).max(2).default(0.2),
  cardsPromptTemplate: z.string().nullable().default(null),
  chatPromptTemplate: z.string().nullable().default(null),
});

export type AssistantSettings = z.input<typeof assistantSettingsValidation>;

export const assistantSettingsFormSchema = z.object({
  temperature: z.number().min(0).max(2),
  cardsPromptTemplate: z.string().nullable(),
  chatPromptTemplate: z.string().nullable(),
});

export type AssistantSettingsFormValues = z.infer<typeof assistantSettingsFormSchema>;

export const aiSettingsValidation = z.object({
  profiles: z.array(aiProfileValidation),
  assistant: assistantSettingsValidation.optional(),
});

export type AISettings = z.input<typeof aiSettingsValidation>;

export const DEFAULT_AI_SETTINGS: AISettings = aiSettingsValidation.parse({
  profiles: [],
});

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
