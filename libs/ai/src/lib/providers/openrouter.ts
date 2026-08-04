import { generateCardsWithOpenRouter } from "../card-generation";
import { streamChatWithOpenRouter } from "../chat-stream";
import { AIError, throwForAIResponse } from "../error";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

type OpenRouterReasoning = {
  mandatory?: boolean;
  default_enabled?: boolean;
  supported_efforts?: string[];
  default_effort?: string;
};

type OpenRouterModelData = Omit<AIModel, "supported_reasoning_levels" | "default_reasoning_level"> & {
  reasoning?: OpenRouterReasoning;
};

type OpenRouterModelsResponse = { data: OpenRouterModelData[] };

export async function fetchOpenRouterModels(): Promise<AIModel[]> {
  const response = await throwForAIResponse(
    await fetch(OPENROUTER_MODELS_URL, {
      headers: { "Content-Type": "application/json" },
    }),
  );

  const data: OpenRouterModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .filter((model) => model.id.includes("/"))
    .map((model) => {
      const { reasoning, ...rest } = model;
      const efforts = reasoning?.supported_efforts;
      return {
        ...rest,
        supported_reasoning_levels:
          efforts && efforts.length > 0 ? efforts.map((effort) => ({ effort, description: "" })) : undefined,
        default_reasoning_level: reasoning?.default_effort,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createOpenRouterClient(secrets: Extract<AISecrets, { provider: "openrouter" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "openrouter",
    listModels: fetchOpenRouterModels,
    chat: (request, onChunk, abortSignal) => streamChatWithOpenRouter(request, onChunk, abortSignal, resolved),
    generateCards: (request) => generateCardsWithOpenRouter(request, resolved),
  };
}

export const openrouterProviderEntry: AIProviderEntry = {
  id: "openrouter",
  createClient: (secrets) => createOpenRouterClient(secrets as Extract<AISecrets, { provider: "openrouter" }>),
  fetchModels: () => fetchOpenRouterModels(),
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "openrouter" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "openrouter" }>;
    return isPresentApiKey(s.apiKey) ? s.apiKey : null;
  },
};
