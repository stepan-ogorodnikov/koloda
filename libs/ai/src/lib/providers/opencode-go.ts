import { streamChatWithOpencodeGo } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import { OPENCODE_GO_BASE_URL } from "../provider-catalog";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";
import { loadModelsDevCatalog, overlayFromModelsDev } from "./models-dev";
import { fetchOpenAICompatibleModelsDetailed } from "./openai-compatible";

export async function fetchOpencodeGoModels(apiKey?: string): Promise<AIModel[]> {
  const modelsUrl = `${OPENCODE_GO_BASE_URL.replace(/\/$/, "")}/models`;
  const [models, catalog] = await Promise.all([
    fetchOpenAICompatibleModelsDetailed(modelsUrl, apiKey),
    loadModelsDevCatalog(),
  ]);
  return overlayFromModelsDev(models, "opencode-go", catalog);
}

function createOpencodeGoClient(secrets: Extract<AISecrets, { provider: "opencodeGo" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "opencodeGo",
    listModels: () => fetchOpencodeGoModels(resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOpencodeGo(request, onChunk, abortSignal, resolved),
  };
}

export const opencodeGoProviderEntry: AIProviderEntry = {
  id: "opencodeGo",
  worksInBrowser: false,
  createClient: (secrets) => createOpencodeGoClient(secrets as Extract<AISecrets, { provider: "opencodeGo" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeGo" }>;
    return fetchOpencodeGoModels(isPresentApiKey(s.apiKey) ? s.apiKey : undefined);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "opencodeGo" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
};
