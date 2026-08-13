import type { AIRuntime } from "@koloda/ai";
import { createAIGenerationClient, fetchModels } from "@koloda/ai";
import type { DB } from "@koloda/srs-pgsql";
import { loadAIProfileSecrets } from "./ai";

// INVARIANT: Demo host adapter. Loads usable secrets from PGlite only at call
// time inside this module — never expose them to shared React / React Query.
export function createDemoAIRuntime(db: DB): AIRuntime {
  return {
    listModels: async (profileId) => {
      const secrets = await loadAIProfileSecrets(db, profileId);
      return secrets ? await fetchModels(secrets) : [];
    },
    // WHY: Demo has no IPC transport — ignore host requestId (logs already recorded it).
    chat: async (profileId, request, onChunk, abortSignal, _requestId) => {
      const secrets = await loadAIProfileSecrets(db, profileId);
      if (!secrets) throw new Error("No secrets loaded for AI profile");
      const client = createAIGenerationClient(secrets);
      return client.chat(request, onChunk, abortSignal);
    },
    generateCards: async (profileId, request, _requestId) => {
      const secrets = await loadAIProfileSecrets(db, profileId);
      if (!secrets) throw new Error("No secrets loaded for AI profile");
      const client = createAIGenerationClient(secrets);
      await client.generateCards(request);
    },
  };
}
