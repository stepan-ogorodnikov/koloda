import { AIError } from "../error";
import type { AIModel } from "../models";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";

export async function fetchCodexModels(): Promise<AIModel[]> {
  throw new AIError("unknown", "Codex provider requires the native app runtime to list models.");
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

export const codexProviderEntry: AIProviderEntry = {
  id: "codex",
  createClient: () => createCodexPlaceholderClient(),
  fetchModels: () => fetchCodexModels(),
  getMissingSecretFields: () => [],
  getApiKey: () => null,
};
