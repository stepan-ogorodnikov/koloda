import { streamChatWithOllama } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";

const OLLAMA_THINKING_REASONING_LEVELS: NonNullable<AIModel["supported_reasoning_levels"]> = [
  { effort: "low", description: "" },
  { effort: "medium", description: "" },
  { effort: "high", description: "" },
];

// WHY: the ollama list Model type may omit capabilities; /api/tags still sends them.
function ollamaListCapabilities(model: object): unknown {
  return "capabilities" in model ? model.capabilities : undefined;
}

// WHY: GPT-OSS intersection advertised when CapabilityThinking is on the list row.
// Omit fields when the tag is missing so the picker stays hidden — no /api/show.
export function ollamaThinkingReasoningLevels(
  capabilities: unknown,
): Pick<AIModel, "supported_reasoning_levels" | "default_reasoning_level"> | undefined {
  if (!Array.isArray(capabilities) || !capabilities.includes("thinking")) return undefined;
  return {
    supported_reasoning_levels: OLLAMA_THINKING_REASONING_LEVELS,
    default_reasoning_level: "medium",
  };
}

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
      ...ollamaThinkingReasoningLevels(ollamaListCapabilities(model)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function createOllamaClient(secrets: Extract<AISecrets, { provider: "ollama" }>): AIGenerationClient {
  const apiKey = isPresentApiKey(secrets.apiKey) ? secrets.apiKey : undefined;
  const resolved = { baseUrl: secrets.baseUrl, apiKey };
  return {
    provider: "ollama",
    listModels: () => fetchOllamaModels(resolved.baseUrl, resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOllama(request, onChunk, abortSignal, resolved),
  };
}

export const ollamaProviderEntry: AIProviderEntry = {
  id: "ollama",
  worksInBrowser: true,
  createClient: (secrets) => createOllamaClient(secrets as Extract<AISecrets, { provider: "ollama" }>),
  fetchModels: (secrets) => fetchOllamaModels((secrets as Extract<AISecrets, { provider: "ollama" }>).baseUrl),
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollama" }>;
    return s.baseUrl ? [] : ["baseUrl"];
  },
  getApiKey: () => null,
};
