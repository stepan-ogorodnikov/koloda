import { generateCardsWithOllama } from "../card-generation";
import { streamChatWithOllama } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";

export async function fetchOllamaModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  const { Ollama } = await import("ollama");
  const client = new Ollama({
    host: baseUrl,
    ...(apiKey ? { apiKey } : {}),
  });

  const response = await client.list();
  if (!response.models) throw new AIError("ai.invalid-response");

  return response.models
    .map((model) => ({
      id: model.model,
      name: model.name ?? model.model,
      context_length: 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function createOllamaClient(secrets: Extract<AISecrets, { provider: "ollama" }>): AIGenerationClient {
  return {
    provider: "ollama",
    listModels: () => fetchOllamaModels(secrets.baseUrl, secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOllama(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOllama(request, secrets),
  };
}

export const ollamaProviderEntry: AIProviderEntry = {
  id: "ollama",
  createClient: (secrets) => createOllamaClient(secrets as Extract<AISecrets, { provider: "ollama" }>),
  fetchModels: (secrets) => fetchOllamaModels((secrets as Extract<AISecrets, { provider: "ollama" }>).baseUrl),
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollama" }>;
    return s.baseUrl ? [] : ["baseUrl"];
  },
  getApiKey: () => null,
};
