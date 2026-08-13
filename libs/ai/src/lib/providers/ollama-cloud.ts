import { generateCardsWithOllamaCloud } from "../card-generation";
import { streamChatWithOllamaCloud } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import { OLLAMA_CLOUD_BASE_URL } from "../provider-catalog";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { fetchOllamaModels } from "./ollama";

export async function fetchOllamaCloudModels(apiKey: string): Promise<AIModel[]> {
  return fetchOllamaModels(OLLAMA_CLOUD_BASE_URL, apiKey);
}

function createOllamaCloudClient(secrets: Extract<AISecrets, { provider: "ollamaCloud" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "ollamaCloud",
    listModels: () => fetchOllamaCloudModels(resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOllamaCloud(request, onChunk, abortSignal, resolved),
    generateCards: (request) => generateCardsWithOllamaCloud(request, resolved),
  };
}

export const ollamaCloudProviderEntry: AIProviderEntry = {
  id: "ollamaCloud",
  worksInBrowser: false,
  createClient: (secrets) => createOllamaCloudClient(secrets as Extract<AISecrets, { provider: "ollamaCloud" }>),
  fetchModels: async (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollamaCloud" }>;
    if (!isPresentApiKey(s.apiKey)) {
      throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
    }
    return fetchOllamaCloudModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollamaCloud" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollamaCloud" }>;
    return isPresentApiKey(s.apiKey) ? s.apiKey : null;
  },
};
