import {
  generateCardsWithLMStudio,
  generateCardsWithOllama,
  generateCardsWithOpencodeGo,
  generateCardsWithOpenRouter,
} from "./card-generation";
import {
  streamChatWithLMStudio,
  streamChatWithOllama,
  streamChatWithOpencodeGo,
  streamChatWithOpenRouter,
} from "./chat-stream";
import { AIError, throwForAIResponse } from "./error";
import type { AIModel, AiProvider, AISecrets, ChatStreamGenerator, GenerateCardsFunction, SecretField } from "./types";
import { OPENCODE_GO_BASE_URL } from "./types";

export type AIGenerationClient = {
  provider: AISecrets["provider"];
  listModels: () => Promise<AIModel[]>;
  chat: ChatStreamGenerator;
  generateCards: GenerateCardsFunction;
};

type OpenRouterReasoning = {
  mandatory?: boolean;
  default_enabled?: boolean;
  supported_efforts?: string[];
  default_effort?: string;
};

type OpenRouterModelData = Omit<AIModel, "supported_reasoning_levels" | "default_reasoning_level"> & {
  reasoning?: OpenRouterReasoning;
};

type OpenRouterModelsResponse = { data: OpenRouterModelData[] };

type OpenAICompatibleModelData = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  context_window?: number;
  top_provider?: AIModel["top_provider"];
  architecture?: AIModel["architecture"];
  supported_parameters?: string[];
  supported_reasoning_levels?: AIModel["supported_reasoning_levels"];
  default_reasoning_level?: string;
};

type OpenAICompatibleModelsResponse = {
  data: OpenAICompatibleModelData[];
};

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export const OPENCODE_GO_MODELS_URL = `${OPENCODE_GO_BASE_URL}/models`;

type ReasoningLevels = {
  levels: Array<{ effort: string; description: string }>;
  default: string;
};

const MIMO_LEVELS: ReasoningLevels = {
  levels: [
    { effort: "low", description: "" },
    { effort: "medium", description: "" },
    { effort: "high", description: "" },
  ],
  default: "medium",
};

const DEEPSEEK_LEVELS: ReasoningLevels = {
  levels: [
    { effort: "low", description: "" },
    { effort: "medium", description: "" },
    { effort: "high", description: "" },
    { effort: "xhigh", description: "" },
  ],
  default: "medium",
};

function resolveReasoningLevelsForModel(id: string): ReasoningLevels | undefined {
  const lower = id.toLowerCase();
  if (lower.startsWith("deepseek-")) return DEEPSEEK_LEVELS;
  if (lower.startsWith("mimo-")) return MIMO_LEVELS;
  return undefined;
}

export async function fetchOpenRouterModels(): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(OPENROUTER_MODELS_URL, {
      headers: { "Content-Type": "application/json" },
    }),
  );

  const data: OpenRouterModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .filter((model) => model.id.includes("/"))
    .map((model) => {
      const { reasoning, ...rest } = model;
      const efforts = reasoning?.supported_efforts;
      return {
        ...rest,
        supported_reasoning_levels: efforts && efforts.length > 0
          ? efforts.map((effort) => ({ effort, description: "" }))
          : undefined,
        default_reasoning_level: reasoning?.default_effort,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOpencodeGoModels(apiKey?: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(`${OPENCODE_GO_BASE_URL.replace(/\/$/, "")}/models`, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }),
  );

  const data: OpenAICompatibleModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .map((model) => {
      const reasoning = resolveReasoningLevelsForModel(model.id);
      return {
        id: model.id,
        name: model.name ?? model.id,
        description: model.description,
        context_length: model.context_length ?? model.context_window ?? 0,
        top_provider: model.top_provider,
        architecture: model.architecture,
        supported_parameters: model.supported_parameters,
        supported_reasoning_levels: model.supported_reasoning_levels ?? reasoning?.levels,
        default_reasoning_level: model.default_reasoning_level ?? reasoning?.default,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(new URL("/v1/models", baseUrl), {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }),
  );

  const data: OpenAICompatibleModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .map((model) => ({
      id: model.id,
      name: model.id,
      context_length: 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
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
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchCodexModels(): Promise<AIModel[]> {
  throw new AIError("unknown", "Codex provider requires the native app runtime to list models.");
}

export type ProviderImplementation = {
  createClient: (secrets: AISecrets) => AIGenerationClient;
  fetchModels: (secrets: AISecrets) => Promise<AIModel[]>;
};

const providerImplementations = new Map<AiProvider, ProviderImplementation>();

export function registerProviderImplementation(
  provider: AiProvider,
  implementation: ProviderImplementation,
) {
  providerImplementations.set(provider, implementation);
}

export type AIProviderEntry = {
  id: AiProvider;
  createClient: (secrets: AISecrets) => AIGenerationClient;
  fetchModels: (secrets: AISecrets) => Promise<AIModel[]>;
  getMissingSecretFields: (secrets: AISecrets) => SecretField[];
  getApiKey: (secrets: AISecrets) => string | null;
};

function createOpenRouterClient(secrets: Extract<AISecrets, { provider: "openrouter" }>): AIGenerationClient {
  return {
    provider: "openrouter",
    listModels: fetchOpenRouterModels,
    chat: (request, onChunk, abortSignal) => streamChatWithOpenRouter(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOpenRouter(request, secrets),
  };
}

function createOllamaClient(secrets: Extract<AISecrets, { provider: "ollama" }>): AIGenerationClient {
  return {
    provider: "ollama",
    listModels: () => fetchOllamaModels(secrets.baseUrl, secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOllama(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOllama(request, secrets),
  };
}

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  return {
    provider: "lmstudio",
    listModels: () => fetchOpenAICompatibleModels(secrets.baseUrl, secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithLMStudio(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithLMStudio(request, secrets),
  };
}

function createOpencodeGoClient(secrets: Extract<AISecrets, { provider: "opencodeGo" }>): AIGenerationClient {
  return {
    provider: "opencodeGo",
    listModels: () => fetchOpencodeGoModels(secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithOpencodeGo(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOpencodeGo(request, secrets),
  };
}

function createCodexPlaceholderClient(): AIGenerationClient {
  const unsupported = async () => {
    throw new AIError("unknown", "Codex provider requires the native app runtime.");
  };

  return {
    provider: "codex",
    listModels: fetchCodexModels,
    chat: unsupported,
    generateCards: unsupported,
  };
}

export const AI_PROVIDER_REGISTRY: Record<AiProvider, AIProviderEntry> = {
  openrouter: {
    id: "openrouter",
    createClient: (secrets) => createOpenRouterClient(secrets as Extract<AISecrets, { provider: "openrouter" }>),
    fetchModels: () => fetchOpenRouterModels(),
    getMissingSecretFields: (secrets) => {
      const s = secrets as Extract<AISecrets, { provider: "openrouter" }>;
      return s.apiKey ? [] : ["apiKey"];
    },
    getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "openrouter" }>).apiKey,
  },
  ollama: {
    id: "ollama",
    createClient: (secrets) => createOllamaClient(secrets as Extract<AISecrets, { provider: "ollama" }>),
    fetchModels: (secrets) => fetchOllamaModels((secrets as Extract<AISecrets, { provider: "ollama" }>).baseUrl),
    getMissingSecretFields: (secrets) => {
      const s = secrets as Extract<AISecrets, { provider: "ollama" }>;
      return s.baseUrl ? [] : ["baseUrl"];
    },
    getApiKey: () => null,
  },
  lmstudio: {
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
  },
  opencodeGo: {
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
  },
  codex: {
    id: "codex",
    createClient: () => createCodexPlaceholderClient(),
    fetchModels: () => fetchCodexModels(),
    getMissingSecretFields: () => [],
    getApiKey: () => null,
  },
};

export function getProviderConfig(provider: AiProvider): AIProviderEntry {
  const entry = AI_PROVIDER_REGISTRY[provider];
  if (!entry) throw new AIError("unknown", `Unsupported provider: ${provider}`);
  return entry;
}

function resolveProviderImplementation(provider: AiProvider): ProviderImplementation {
  const override = providerImplementations.get(provider);
  if (override) return override;
  const entry = AI_PROVIDER_REGISTRY[provider];
  return {
    createClient: (secrets) => entry.createClient(secrets),
    fetchModels: (secrets) => entry.fetchModels(secrets),
  };
}

export function createAIGenerationClient(secretsInput: AISecrets | string): AIGenerationClient {
  const secrets: AISecrets = typeof secretsInput === "string"
    ? ({ provider: "openrouter", apiKey: secretsInput } as const)
    : secretsInput;

  return resolveProviderImplementation(secrets.provider).createClient(secrets);
}

export async function fetchModels(secrets?: AISecrets | null): Promise<AIModel[]> {
  if (!secrets) return fetchOpenRouterModels();
  return resolveProviderImplementation(secrets.provider).fetchModels(secrets);
}
