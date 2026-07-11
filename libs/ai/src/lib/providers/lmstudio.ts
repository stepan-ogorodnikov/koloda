import { generateCardsWithLMStudio } from "../card-generation";
import { streamChatWithLMStudio } from "../chat-stream";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { fetchOpenAICompatibleModels } from "./openai-compatible";

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  return {
    provider: "lmstudio",
    listModels: () => fetchOpenAICompatibleModels(secrets.baseUrl, secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithLMStudio(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithLMStudio(request, secrets),
  };
}

export const lmstudioProviderEntry: AIProviderEntry = {
  id: "lmstudio",
  createClient: (secrets) => createLmStudioClient(secrets as Extract<AISecrets, { provider: "lmstudio" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return fetchOpenAICompatibleModels(s.baseUrl, s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return s.baseUrl ? [] : ["baseUrl"];
  },
  getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "lmstudio" }>).apiKey ?? null,
};
