import { streamChatWithLMStudio } from "../chat-stream";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { fetchOpenAICompatibleModels } from "./openai-compatible";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type LmStudioReasoning = Pick<AIModel, "supported_reasoning_levels" | "default_reasoning_level">;

export function lmStudioReasoningFromCapabilities(capabilities: unknown): LmStudioReasoning | undefined {
  if (!isPlainObject(capabilities) || !isPlainObject(capabilities.reasoning)) return undefined;
  const reasoning = capabilities.reasoning;
  if (!Array.isArray(reasoning.allowed_options)) return undefined;

  const values = reasoning.allowed_options.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (values.length === 0) return undefined;

  const defaultLevel =
    typeof reasoning.default === "string" && values.includes(reasoning.default) ? reasoning.default : values[0];

  return {
    supported_reasoning_levels: values.map((effort) => ({ effort, description: "" })),
    default_reasoning_level: defaultLevel,
  };
}

function nativeReasoningByKey(catalog: unknown): Map<string, LmStudioReasoning> | null {
  if (!isPlainObject(catalog) || !Array.isArray(catalog.models)) return null;

  const byKey = new Map<string, LmStudioReasoning>();
  for (const row of catalog.models) {
    if (!isPlainObject(row) || typeof row.key !== "string") continue;
    const reasoning = lmStudioReasoningFromCapabilities(row.capabilities);
    if (reasoning) byKey.set(row.key, reasoning);
  }
  return byKey;
}

function lookupNativeReasoning(byKey: Map<string, LmStudioReasoning>, id: string): LmStudioReasoning | undefined {
  const exact = byKey.get(id);
  if (exact) return exact;
  // WHY: /v1/models may list a selected variant (`key@quant`); reasoning lives on the family key.
  const variantAt = id.indexOf("@");
  if (variantAt > 0) return byKey.get(id.slice(0, variantAt));
  return undefined;
}

export function overlayLmStudioReasoning(models: AIModel[], catalog: unknown | null): AIModel[] {
  const byKey = catalog == null ? null : nativeReasoningByKey(catalog);
  if (!byKey) return models;

  return models.map((model) => {
    const reasoning = lookupNativeReasoning(byKey, model.id);
    if (!reasoning) return model;
    return {
      ...model,
      supported_reasoning_levels: model.supported_reasoning_levels ?? reasoning.supported_reasoning_levels,
      default_reasoning_level: model.default_reasoning_level ?? reasoning.default_reasoning_level,
    };
  });
}

async function loadLmStudioNativeModels(baseUrl: string, apiKey?: string): Promise<unknown | null> {
  try {
    const response = await fetch(new URL("/api/v1/models", baseUrl), {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isPlainObject(data) ? data : null;
  } catch {
    return null;
  }
}

export async function fetchLmStudioModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  const [models, catalog] = await Promise.all([
    fetchOpenAICompatibleModels(baseUrl, apiKey),
    loadLmStudioNativeModels(baseUrl, apiKey),
  ]);
  return overlayLmStudioReasoning(models, catalog);
}

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  const apiKey = isPresentApiKey(secrets.apiKey) ? secrets.apiKey : undefined;
  const resolved = { baseUrl: secrets.baseUrl, apiKey };
  return {
    provider: "lmstudio",
    listModels: () => fetchLmStudioModels(resolved.baseUrl, resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithLMStudio(request, onChunk, abortSignal, resolved),
  };
}

export const lmstudioProviderEntry: AIProviderEntry = {
  id: "lmstudio",
  worksInBrowser: true,
  createClient: (secrets) => createLmStudioClient(secrets as Extract<AISecrets, { provider: "lmstudio" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return fetchLmStudioModels(s.baseUrl, isPresentApiKey(s.apiKey) ? s.apiKey : undefined);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return s.baseUrl ? [] : ["baseUrl"];
  },
};
