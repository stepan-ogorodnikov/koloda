import {
  ASSISTANT_TOOL_SPECS,
  shapeGetDeckCardsOutput,
  shapeListDecksOutput,
  shapeProposeCardsOutput,
} from "./assistant-tools";
import type { AssistantToolCard, AssistantToolExecutor, AssistantToolTemplate } from "./assistant-tools";

/**
 * Data access the assistant tools need. Injected by the host so this module
 * stays I/O-free (libs/ai holds shaping and budgets only — hosts bind the DB).
 * Each fn may be sync (NAPI) or async (PGlite); `await` normalizes both.
 */
export type AssistantToolDataSource = {
  getDecks: () =>
    | Promise<Array<{ id: number; title: string; templateId: number }>>
    | Array<{ id: number; title: string; templateId: number }>;
  getTemplates: () => Promise<AssistantToolTemplate[]> | AssistantToolTemplate[];
  getCards: (params: { deckId: number }) => Promise<AssistantToolCard[]> | AssistantToolCard[];
  getCardCounts: () => Promise<Record<number, number>> | Record<number, number>;
};

/**
 * Shared assistant tool executor. One find-deck → find-template → shape
 * pipeline for every host; adding a tool changes one place instead of
 * duplicating per-host lookup logic.
 */
export function createAssistantToolExecutor(data: AssistantToolDataSource): AssistantToolExecutor {
  return async (name, input) => {
    if (name === "list_decks") {
      const [decks, templates, counts] = await Promise.all([
        data.getDecks(),
        data.getTemplates(),
        data.getCardCounts(),
      ]);
      return shapeListDecksOutput(
        decks.map((deck) => ({
          id: deck.id,
          title: deck.title,
          templateId: deck.templateId,
          cardCount: counts[deck.id] ?? 0,
        })),
        templates,
      );
    }
    if (name === "get_deck_cards") {
      const { deckId } = ASSISTANT_TOOL_SPECS.get_deck_cards.inputSchema.parse(input);
      const [decks, templates, cards] = await Promise.all([
        data.getDecks(),
        data.getTemplates(),
        data.getCards({ deckId }),
      ]);
      const deck = decks.find((row) => row.id === deckId);
      if (deck == null) throw new Error(`Deck not found: ${deckId}`);
      const template = templates.find((row) => row.id === deck.templateId);
      if (template == null) throw new Error(`Template not found for deck: ${deckId}`);
      return shapeGetDeckCardsOutput({ id: deck.id, title: deck.title, template }, cards);
    }
    if (name === "propose_cards") {
      const { deckId, cards } = ASSISTANT_TOOL_SPECS.propose_cards.inputSchema.parse(input);
      const [decks, templates] = await Promise.all([data.getDecks(), data.getTemplates()]);
      const deck = decks.find((row) => row.id === deckId);
      if (deck == null) throw new Error(`Deck not found: ${deckId}`);
      const template = templates.find((row) => row.id === deck.templateId);
      if (template == null) throw new Error(`Template not found for deck: ${deckId}`);
      return shapeProposeCardsOutput({ id: deck.id, title: deck.title, template }, cards);
    }
    throw new Error(`Unknown assistant tool: ${name}`);
  };
}
