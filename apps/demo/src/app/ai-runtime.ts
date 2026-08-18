import type { AIRuntime, AssistantToolExecutor } from "@koloda/ai";
import { ASSISTANT_TOOL_SPECS, createAIGenerationClient, fetchModels } from "@koloda/ai";
import { shapeGetDeckCardsOutput, shapeListDecksOutput, shapeProposeCardsOutput } from "@koloda/ai";
import type { DB } from "@koloda/srs-pgsql";
import { getCards, getDecks, getTemplates } from "@koloda/srs-pgsql";
import { loadAIProfileSecrets } from "./ai";

// INVARIANT: Demo host executor — closes over the PGlite db via the same in-process
// query implementations queries.ts uses; shaping and budgets live in @koloda/ai.
function createDemoToolExecutor(db: DB): AssistantToolExecutor {
  return async (name, input) => {
    if (name === "list_decks") {
      const decks = await getDecks(db);
      const templates = await getTemplates(db);
      const cardsPerDeck = await Promise.all(decks.map((deck) => getCards(db, { deckId: deck.id })));
      return shapeListDecksOutput(
        decks.map((deck, index) => ({
          id: deck.id,
          title: deck.title,
          templateId: deck.templateId,
          cardCount: cardsPerDeck[index].length,
        })),
        templates,
      );
    }
    if (name === "get_deck_cards") {
      const { deckId } = ASSISTANT_TOOL_SPECS.get_deck_cards.inputSchema.parse(input);
      const deck = (await getDecks(db)).find((row) => row.id === deckId);
      if (deck == null) throw new Error(`Deck not found: ${deckId}`);
      const template = (await getTemplates(db)).find((row) => row.id === deck.templateId);
      if (template == null) throw new Error(`Template not found for deck: ${deckId}`);
      const cards = await getCards(db, { deckId });
      return shapeGetDeckCardsOutput({ id: deck.id, title: deck.title, template }, cards);
    }
    if (name === "propose_cards") {
      const { deckId, cards } = ASSISTANT_TOOL_SPECS.propose_cards.inputSchema.parse(input);
      const deck = (await getDecks(db)).find((row) => row.id === deckId);
      if (deck == null) throw new Error(`Deck not found: ${deckId}`);
      const template = (await getTemplates(db)).find((row) => row.id === deck.templateId);
      if (template == null) throw new Error(`Template not found for deck: ${deckId}`);
      return shapeProposeCardsOutput({ id: deck.id, title: deck.title, template }, cards);
    }
    throw new Error(`Unknown assistant tool: ${name}`);
  };
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
      if (!secrets) throw new Error("No secrets loaded for AI profile");
      const client = createAIGenerationClient(secrets);
      // Demo is in-process: the executor binds directly and onToolEvent passes through untouched.
      const requestWithExecutor =
        request.tools != null && request.tools.length > 0 ? { ...request, executeTool: demoToolExecutor } : request;
      return client.chat(requestWithExecutor, onChunk, abortSignal);
    },
    generateCards: async (profileId, request, _requestId) => {
      const secrets = await loadAIProfileSecrets(db, profileId);
      if (!secrets) throw new Error("No secrets loaded for AI profile");
      const client = createAIGenerationClient(secrets);
      await client.generateCards(request);
    },
  };
}
