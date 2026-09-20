import {
  aiProfileValidation,
  lmstudioSecretsValidation,
  openaiSecretsValidation,
  ollamaCloudSecretsValidation,
  ollamaSecretsValidation,
  opencodeGoSecretsValidation,
  opencodeZenSecretsValidation,
  openRouterSecretsValidation,
} from "@koloda/ai";
import type { AiProvider, AISecrets } from "@koloda/ai";
import { z } from "zod";
import type { ZodObject, ZodRawShape } from "zod";

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
  schema: ZodObject<ZodRawShape>;
  toSecrets: (values: AIProfileFormValues) => AISecrets;
  fromSecrets: (secrets: AISecrets | undefined) => Pick<AIProfileFormValues, "baseUrl" | "apiKey">;
};

const titleField: AIProfileProviderField = {
  type: "title",
  isRequired: false,
  defaultValue: "",
};

function apiKeyOnlyConfig(
  provider: "openai" | "openrouter" | "opencodeGo" | "opencodeZen" | "ollamaCloud",
  secretsSchema: typeof openRouterSecretsValidation,
): AIProviderFormConfig {
  return {
    fields: [titleField, { type: "apiKey", isRequired: true, defaultValue: "" }],
    schema: secretsSchema.extend({
      title: aiProfileValidation.shape.title,
    }),
    toSecrets: (values) => ({ provider, apiKey: values.apiKey ?? "" }),
    fromSecrets: (secrets) => ({
      apiKey: secrets?.provider === provider ? (secrets.apiKey ?? "") : "",
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
  openai: apiKeyOnlyConfig("openai", openaiSecretsValidation),
  openrouter: apiKeyOnlyConfig("openrouter", openRouterSecretsValidation),
  opencodeGo: apiKeyOnlyConfig("opencodeGo", opencodeGoSecretsValidation),
  opencodeZen: apiKeyOnlyConfig("opencodeZen", opencodeZenSecretsValidation),
  ollamaCloud: apiKeyOnlyConfig("ollamaCloud", ollamaCloudSecretsValidation),
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

// WHY: Public profiles never return apiKey; keep existing key when the field is left blank.
// A typed replacement satisfies the same add-schema rule, so edit rejects the same
// whitespace-only keys as add — mirroring require_api_key_for_input in domain/ai.rs.
export function getEditSchema(config: AIProviderFormConfig, hasSecrets: boolean): ZodObject<ZodRawShape> {
  if (!hasSecrets) return config.schema;
  const apiKeyField = config.fields.find((field) => field.type === "apiKey");
  // Optional keys stay as lenient as the add schema — Rust ignores them on input.
  if (!apiKeyField?.isRequired) return config.schema;
  return config.schema.extend({
    apiKey: z.preprocess((value) => (value === "" ? undefined : value), z.optional(config.schema.shape.apiKey)),
  });
}
