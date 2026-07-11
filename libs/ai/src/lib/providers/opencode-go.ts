import { generateCardsWithOpencodeGo } from "../card-generation";
import { streamChatWithOpencodeGo } from "../chat-stream";
import type { AIModel } from "../models";
import { OPENCODE_GO_BASE_URL } from "../provider-catalog";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { fetchOpenAICompatibleModelsDetailed } from "./openai-compatible";

export const OPENCODE_GO_MODELS_URL = `${OPENCODE_GO_BASE_URL}/models`;

export async function fetchOpencodeGoModels(apiKey?: string): Promise<AIModel[]> {
  return fetchOpenAICompatibleModelsDetailed(
    `${OPENCODE_GO_BASE_URL.replace(/\/$/, "")}/models`,
    apiKey,
  );
}

function createOpencodeGoClient(secrets: Extract<AISecrets, { provider: "opencodeGo" }>): AIGenerationClient {
  return {
    provider: "opencodeGo",
    listModels: () => fetchOpencodeGoModels(secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOpencodeGo(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOpencodeGo(request, secrets),
  };
}

export const opencodeGoProviderEntry: AIProviderEntry = {
  id: "opencodeGo",
  createClient: (secrets) => createOpencodeGoClient(secrets as Extract<AISecrets, { provider: "opencodeGo" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeGo" }>;
    return fetchOpencodeGoModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeGo" }>;
    return s.apiKey ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "opencodeGo" }>).apiKey,
};
