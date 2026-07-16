import {
  aiProfileValidation,
  type AiProvider,
  type AISecrets,
  lmstudioSecretsValidation,
  ollamaSecretsValidation,
  opencodeGoSecretsValidation,
  opencodeZenSecretsValidation,
  openRouterSecretsValidation,
} from "@koloda/ai";
import type { z } from "zod";

export type AIProfileFieldType = "title" | "baseUrl" | "apiKey";

export type AIProfileProviderField = {
  type: AIProfileFieldType;
  isRequired: boolean;
  defaultValue: string;
};

export type AIProfileFormValues = {
  title?: string;
  baseUrl?: string;
  apiKey?: string;
};

export type AIProviderFormConfig = {
  fields: AIProfileProviderField[];
  /** Concrete Zod object used as TanStack Form `onSubmit` validator (Standard Schema). */
  schema: z.ZodObject<z.ZodRawShape>;
  toSecrets: (values: AIProfileFormValues) => AISecrets;
  fromSecrets: (secrets: AISecrets | undefined) => Pick<AIProfileFormValues, "baseUrl" | "apiKey">;
};

const titleField: AIProfileProviderField = {
  type: "title",
  isRequired: false,
  defaultValue: "",
};

function apiKeyOnlyConfig(
  provider: "openrouter" | "opencodeGo" | "opencodeZen",
  secretsSchema: typeof openRouterSecretsValidation,
): AIProviderFormConfig {
  return {
    fields: [titleField, { type: "apiKey", isRequired: true, defaultValue: "" }],
    schema: secretsSchema.extend({
      title: aiProfileValidation.shape.title,
    }),
    toSecrets: (values) => ({ provider, apiKey: values.apiKey ?? "" }),
    fromSecrets: (secrets) => ({
      apiKey: secrets?.provider === provider ? secrets.apiKey : "",
    }),
  };
}

function baseUrlConfig(
  provider: "ollama" | "lmstudio",
  secretsSchema: typeof ollamaSecretsValidation,
  defaultBaseUrl: string,
): AIProviderFormConfig {
  return {
    fields: [
      titleField,
      { type: "baseUrl", isRequired: true, defaultValue: defaultBaseUrl },
      { type: "apiKey", isRequired: false, defaultValue: "" },
    ],
    schema: secretsSchema.extend({
      title: aiProfileValidation.shape.title,
    }),
    toSecrets: (values) => ({
      provider,
      baseUrl: values.baseUrl ?? "",
      ...(values.apiKey ? { apiKey: values.apiKey } : {}),
    }),
    fromSecrets: (secrets) => {
      if (secrets?.provider !== provider) {
        return { baseUrl: defaultBaseUrl, apiKey: "" };
      }
      return {
        baseUrl: secrets.baseUrl,
        apiKey: secrets.apiKey ?? "",
      };
    },
  };
}

export const AI_PROVIDER_FORM_CONFIG: Record<AiProvider, AIProviderFormConfig> = {
  openrouter: apiKeyOnlyConfig("openrouter", openRouterSecretsValidation),
  opencodeGo: apiKeyOnlyConfig("opencodeGo", opencodeGoSecretsValidation),
  opencodeZen: apiKeyOnlyConfig("opencodeZen", opencodeZenSecretsValidation),
  ollama: baseUrlConfig("ollama", ollamaSecretsValidation, "http://localhost:11434"),
  lmstudio: baseUrlConfig("lmstudio", lmstudioSecretsValidation, "http://localhost:1234/v1"),
};

export function getAddDefaultValues(config: AIProviderFormConfig): AIProfileFormValues {
  return Object.fromEntries(config.fields.map((field) => [field.type, field.defaultValue]));
}

export function getEditDefaultValues(
  config: AIProviderFormConfig,
  profile: { title?: string; secrets?: AISecrets },
): AIProfileFormValues {
  return {
    ...getAddDefaultValues(config),
    title: profile.title ?? "",
    ...config.fromSecrets(profile.secrets),
  };
}
