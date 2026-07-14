import { AIError } from "./error";
import type { ChatStreamGenerator, GenerateCardsFunction } from "./generation";
import type { AIModel } from "./models";
import type { AiProvider } from "./provider-catalog";
import type { AISecrets, SecretField } from "./provider-secrets";
import { lmstudioProviderEntry } from "./providers/lmstudio";
import { ollamaProviderEntry } from "./providers/ollama";
import { opencodeGoProviderEntry } from "./providers/opencode-go";
import { opencodeZenProviderEntry } from "./providers/opencode-zen";
import { fetchOpenRouterModels, openrouterProviderEntry } from "./providers/openrouter";

export type AIGenerationClient = {
  provider: AISecrets["provider"];
  listModels: () => Promise<AIModel[]>;
  chat: ChatStreamGenerator;
  generateCards: GenerateCardsFunction;
};

export type AIProviderEntry = {
  id: AiProvider;
  createClient: (secrets: AISecrets) => AIGenerationClient;
  fetchModels: (secrets: AISecrets) => Promise<AIModel[]>;
  getMissingSecretFields: (secrets: AISecrets) => SecretField[];
  getApiKey: (secrets: AISecrets) => string | null;
};

export const AI_PROVIDER_REGISTRY: Record<AiProvider, AIProviderEntry> = {
  openrouter: openrouterProviderEntry,
  ollama: ollamaProviderEntry,
  lmstudio: lmstudioProviderEntry,
  opencodeGo: opencodeGoProviderEntry,
  opencodeZen: opencodeZenProviderEntry,
};

export function getProviderConfig(provider: AiProvider): AIProviderEntry {
  const entry = AI_PROVIDER_REGISTRY[provider];
  if (!entry) throw new AIError("unknown", `Unsupported provider: ${provider}`);

  return entry;
}

export function createAIGenerationClient(secretsInput: AISecrets | string): AIGenerationClient {
  const secrets: AISecrets =
    typeof secretsInput === "string" ? ({ provider: "openrouter", apiKey: secretsInput } as const) : secretsInput;

  return getProviderConfig(secrets.provider).createClient(secrets);
}

export async function fetchModels(secrets?: AISecrets | null): Promise<AIModel[]> {
  if (!secrets) return fetchOpenRouterModels();
  return getProviderConfig(secrets.provider).fetchModels(secrets);
}
