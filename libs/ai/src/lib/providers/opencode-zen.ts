import { generateCardsWithOpencodeZen } from "../card-generation";
import { streamChatWithOpencodeZen } from "../chat-stream";
import type { AIModel } from "../models";
import { OPENCODE_ZEN_BASE_URL } from "../provider-catalog";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { fetchOpenAICompatibleModelsDetailed } from "./openai-compatible";

export const OPENCODE_ZEN_MODELS_URL = `${OPENCODE_ZEN_BASE_URL}/models`;

export async function fetchOpencodeZenModels(apiKey?: string): Promise<AIModel[]> {
  return fetchOpenAICompatibleModelsDetailed(
    `${OPENCODE_ZEN_BASE_URL.replace(/\/$/, "")}/models`,
    apiKey,
  );
}

function createOpencodeZenClient(secrets: Extract<AISecrets, { provider: "opencodeZen" }>): AIGenerationClient {
  return {
    provider: "opencodeZen",
    listModels: () => fetchOpencodeZenModels(secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOpencodeZen(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOpencodeZen(request, secrets),
  };
}

export const opencodeZenProviderEntry: AIProviderEntry = {
  id: "opencodeZen",
  createClient: (secrets) => createOpencodeZenClient(secrets as Extract<AISecrets, { provider: "opencodeZen" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeZen" }>;
    return fetchOpencodeZenModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeZen" }>;
    return s.apiKey ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "opencodeZen" }>).apiKey,
};
