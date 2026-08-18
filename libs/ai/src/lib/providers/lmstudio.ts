import { streamChatWithLMStudio } from "../chat-stream";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { fetchOpenAICompatibleModels } from "./openai-compatible";

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  const apiKey = isPresentApiKey(secrets.apiKey) ? secrets.apiKey : undefined;
  const resolved = { baseUrl: secrets.baseUrl, apiKey };
  return {
    provider: "lmstudio",
    listModels: () => fetchOpenAICompatibleModels(resolved.baseUrl, resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithLMStudio(request, onChunk, abortSignal, resolved),
  };
}

export const lmstudioProviderEntry: AIProviderEntry = {
  id: "lmstudio",
  worksInBrowser: true,
  createClient: (secrets) => createLmStudioClient(secrets as Extract<AISecrets, { provider: "lmstudio" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return fetchOpenAICompatibleModels(s.baseUrl, isPresentApiKey(s.apiKey) ? s.apiKey : undefined);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return s.baseUrl ? [] : ["baseUrl"];
  },
  getApiKey: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
    return isPresentApiKey(s.apiKey) ? s.apiKey : null;
  },
};
