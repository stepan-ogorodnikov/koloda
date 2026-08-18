import { streamChatWithOpencodeZen } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import { OPENCODE_ZEN_BASE_URL } from "../provider-catalog";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { fetchOpenAICompatibleModelsDetailed } from "./openai-compatible";

export const OPENCODE_ZEN_MODELS_URL = `${OPENCODE_ZEN_BASE_URL}/models`;

export async function fetchOpencodeZenModels(apiKey?: string): Promise<AIModel[]> {
  return fetchOpenAICompatibleModelsDetailed(`${OPENCODE_ZEN_BASE_URL.replace(/\/$/, "")}/models`, apiKey);
}

function createOpencodeZenClient(secrets: Extract<AISecrets, { provider: "opencodeZen" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "opencodeZen",
    listModels: () => fetchOpencodeZenModels(resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOpencodeZen(request, onChunk, abortSignal, resolved),
  };
}

export const opencodeZenProviderEntry: AIProviderEntry = {
  id: "opencodeZen",
  worksInBrowser: false,
  createClient: (secrets) => createOpencodeZenClient(secrets as Extract<AISecrets, { provider: "opencodeZen" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeZen" }>;
    return fetchOpencodeZenModels(isPresentApiKey(s.apiKey) ? s.apiKey : undefined);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeZen" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeZen" }>;
    return isPresentApiKey(s.apiKey) ? s.apiKey : null;
  },
};
