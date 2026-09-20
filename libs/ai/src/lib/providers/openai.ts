import { streamChatWithOpenAI } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { loadModelsDevCatalog, overlayFromModelsDev } from "./models-dev";
import { fetchOpenAICompatibleModels } from "./openai-compatible";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export async function fetchOpenAIModels(apiKey: string): Promise<AIModel[]> {
  const [models, catalog] = await Promise.all([
    fetchOpenAICompatibleModels(OPENAI_BASE_URL, apiKey),
    loadModelsDevCatalog(),
  ]);
  return overlayFromModelsDev(models, "openai", catalog);
}

function createOpenAIClient(secrets: Extract<AISecrets, { provider: "openai" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.api-key", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "openai",
    listModels: () => fetchOpenAIModels(resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOpenAI(request, onChunk, abortSignal, resolved),
  };
}

export const openaiProviderEntry: AIProviderEntry = {
  id: "openai",
  // OpenAI's public API does not provide the CORS headers required for page-origin fetches.
  worksInBrowser: false,
  createClient: (secrets) => createOpenAIClient(secrets as Extract<AISecrets, { provider: "openai" }>),
  fetchModels: async (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "openai" }>;
    if (!isPresentApiKey(s.apiKey)) {
      throw new AIError("validation.settings-ai.providers.api-key", "apiKey is required");
    }
    return fetchOpenAIModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "openai" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
};
