import { streamChatWithOllama } from "../chat-stream";
import { AIError } from "../error";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AISecrets } from "../provider-secrets";
import { isPresentApiKey } from "../provider-secrets";

const OLLAMA_GPT_OSS_REASONING_LEVELS: NonNullable<AIModel["supported_reasoning_levels"]> = [
  { effort: "low", description: "" },
  { effort: "medium", description: "" },
  { effort: "high", description: "" },
];

const OLLAMA_BOOLEAN_THINKING_LEVELS: NonNullable<AIModel["supported_reasoning_levels"]> = [
  { effort: "off", description: "" },
  { effort: "on", description: "" },
];

// WHY: the ollama list Model type may omit capabilities; /api/tags still sends them.
function ollamaListCapabilities(model: object): unknown {
  return "capabilities" in model ? model.capabilities : undefined;
}

function ollamaModelIsGptOss(modelId: string): boolean {
  return modelId.toLowerCase().includes("gpt-oss");
}

// WHY: CapabilityThinking only means thought can be enabled. GPT-OSS accepts
// string effort; other thinking models only accept a boolean think flag — sending
// low/medium/high to those models fails the request. Omit fields when the tag is
// missing so the picker stays hidden — no /api/show.
export function ollamaThinkingReasoningLevels(
  modelId: string,
  capabilities: unknown,
): Pick<AIModel, "supported_reasoning_levels" | "default_reasoning_level"> | undefined {
  if (!Array.isArray(capabilities) || !capabilities.includes("thinking")) return undefined;
  if (ollamaModelIsGptOss(modelId)) {
    return {
      supported_reasoning_levels: OLLAMA_GPT_OSS_REASONING_LEVELS,
      default_reasoning_level: "medium",
    };
  }
  return {
    supported_reasoning_levels: OLLAMA_BOOLEAN_THINKING_LEVELS,
    default_reasoning_level: "on",
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
      ...ollamaThinkingReasoningLevels(model.model, ollamaListCapabilities(model)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollama" }>;
    return fetchOllamaModels(s.baseUrl, isPresentApiKey(s.apiKey) ? s.apiKey : undefined);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "ollama" }>;
    return s.baseUrl ? [] : ["baseUrl"];
  },
};
