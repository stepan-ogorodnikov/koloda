import type { AIRuntime } from "@koloda/ai";
import { createAIGenerationClient, createAssistantToolExecutor, fetchModels } from "@koloda/ai";
import { AppError } from "@koloda/app";
import type { DB } from "@koloda/srs-pgsql";
import { getCardCounts, getCards, getDecks, getTemplates } from "@koloda/srs-pgsql";
import { loadAIProfileSecrets } from "./ai";

// INVARIANT: Demo host executor — closes over the PGlite db via the same in-process
// query implementations queries.ts uses; shaping and budgets live in @koloda/ai.
function createDemoToolExecutor(db: DB) {
  return createAssistantToolExecutor({
    getDecks: () => getDecks(db),
    getTemplates: () => getTemplates(db),
    getCards: ({ deckId }) => getCards(db, { deckId }),
    getCardCounts: () => getCardCounts(db),
  });
}

// INVARIANT: Demo host adapter. Loads usable secrets from PGlite only at call
// time inside this module — never expose them to shared React / React Query.
export function createDemoAIRuntime(db: DB): AIRuntime {
  const demoToolExecutor = createDemoToolExecutor(db);
  return {
    listModels: async (profileId) => {
      const secrets = await loadAIProfileSecrets(db, profileId);
      return secrets ? await fetchModels(secrets) : [];
    },
    // WHY: Demo has no IPC transport — ignore host requestId (logs already recorded it).
    chat: async (profileId, request, onChunk, abortSignal, _requestId) => {
      const secrets = await loadAIProfileSecrets(db, profileId);
      if (!secrets) throw new AppError("not-found.ai-profile", "No secrets loaded for AI profile");
      const client = createAIGenerationClient(secrets);
      // Demo is in-process: the executor binds directly and onToolEvent passes through untouched.
      const requestWithExecutor =
        request.tools != null && request.tools.length > 0 ? { ...request, executeTool: demoToolExecutor } : request;
      return client.chat(requestWithExecutor, onChunk, abortSignal);
    },
  };
}
