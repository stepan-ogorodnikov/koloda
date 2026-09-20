import { streamChatWithDeepSeek } from "../chat-stream";
import { AIError, throwForAIResponse } from "../error";
import type { AIModel } from "../models";
import { DEEPSEEK_BASE_URL } from "../provider-catalog";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { loadModelsDevCatalog, overlayFromModelsDev } from "./models-dev";

export const DEEPSEEK_MODELS_URL = `${DEEPSEEK_BASE_URL}/models`;

type DeepSeekModelsResponse = {
  data: Array<{ id: string }>;
};

function isDeepSeekModel(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

export async function fetchDeepSeekModels(apiKey: string): Promise<AIModel[]> {
  const [response, catalog] = await Promise.all([
    throwForAIResponse(
      await fetch(DEEPSEEK_MODELS_URL, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }),
    ),
    loadModelsDevCatalog(),
  ]);

  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("data" in data) ||
    !Array.isArray(data.data) ||
    !data.data.every(isDeepSeekModel)
  ) {
    throw new AIError("ai.invalid-response");
  }

  const models: DeepSeekModelsResponse["data"] = data.data;
  return overlayFromModelsDev(
    models
      .map((model) => ({ id: model.id, name: model.id, context_length: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    "deepseek",
    catalog,
  );
}

function createDeepSeekClient(secrets: Extract<AISecrets, { provider: "deepseek" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.api-key", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "deepseek",
    listModels: () => fetchDeepSeekModels(resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithDeepSeek(request, onChunk, abortSignal, resolved),
  };
}

export const deepseekProviderEntry: AIProviderEntry = {
  id: "deepseek",
  // DeepSeek's public API does not provide the CORS headers required for page-origin fetches.
  worksInBrowser: false,
  createClient: (secrets) => createDeepSeekClient(secrets as Extract<AISecrets, { provider: "deepseek" }>),
  fetchModels: async (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "deepseek" }>;
    if (!isPresentApiKey(s.apiKey)) {
      throw new AIError("validation.settings-ai.providers.api-key", "apiKey is required");
    }
    return fetchDeepSeekModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "deepseek" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
};
