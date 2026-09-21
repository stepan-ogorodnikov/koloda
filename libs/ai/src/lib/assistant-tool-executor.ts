import {
  ASSISTANT_TOOL_SPECS,
  shapeAddDeckOutput,
  shapeGetDeckCardsOutput,
  shapeGetDeckOutput,
  shapeGetTemplateOutput,
  shapeListAlgorithmsOutput,
  shapeListDecksOutput,
  shapeListTemplatesOutput,
  shapeProposeCardsOutput,
} from "./assistant-tools";
import type {
  AssistantToolAlgorithm,
  AssistantToolCard,
  AssistantToolExecutor,
  AssistantToolTemplate,
} from "./assistant-tools";

/**
 * Data access the assistant tools need. Injected by the host so this module
 * stays I/O-free (libs/ai holds shaping and budgets only — hosts bind the DB).
 * Each fn may be sync (NAPI) or async (web SQLite); `await` normalizes both.
 */
export type AssistantToolDataSource = {
  getDecks: () =>
    | Promise<Array<{ id: string; title: string; templateId: string }>>
    | Array<{ id: string; title: string; templateId: string }>;
  getTemplates: () => Promise<AssistantToolTemplate[]> | AssistantToolTemplate[];
  getAlgorithms: () => Promise<AssistantToolAlgorithm[]> | AssistantToolAlgorithm[];
  getCards: (params: { deckId: string }) => Promise<AssistantToolCard[]> | AssistantToolCard[];
  getCardCounts: () => Promise<Record<string, number>> | Record<string, number>;
  /** App default algorithm — the same id manual deck create stores when the user does not pick one. */
  getDefaultAlgorithmId: () => Promise<string> | string;
  /**
   * Persist an empty deck. Called only after template and algorithm resolution succeed.
   * `algorithmId` is always explicit here; the host does not invent cards.
   */
  createDeck: (input: {
    title: string;
    templateId: string;
    algorithmId: string;
  }) =>
    | Promise<{ id: string; title: string; templateId: string; algorithmId: string }>
    | { id: string; title: string; templateId: string; algorithmId: string };
};

/**
 * Shared assistant tool executor. Reads resolve through the host data source
 * and shape here. `add_deck` validates the template and algorithm, then calls
 * `createDeck`. It does not create cards or set a propose write target.
 */
export function createAssistantToolExecutor(data: AssistantToolDataSource): AssistantToolExecutor {
  const resolveDeckTemplate = async (deckId: string) => {
    const [decks, templates] = await Promise.all([data.getDecks(), data.getTemplates()]);
    const deck = decks.find((row) => row.id === deckId);
    if (deck == null) throw new Error(`Deck not found: ${deckId}`);
    const template = templates.find((row) => row.id === deck.templateId);
    if (template == null) throw new Error(`Template not found for deck: ${deckId}`);
    return { deck, template };
  };

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
    if (name === "list_templates") {
      const templates = await data.getTemplates();
      return shapeListTemplatesOutput(templates);
    }
    if (name === "list_algorithms") {
      const algorithms = await data.getAlgorithms();
      return shapeListAlgorithmsOutput(algorithms);
    }
    if (name === "get_deck") {
      const { deckId } = ASSISTANT_TOOL_SPECS.get_deck.inputSchema.parse(input);
      const [decks, templates, counts] = await Promise.all([
        data.getDecks(),
        data.getTemplates(),
        data.getCardCounts(),
      ]);
      const deck = decks.find((row) => row.id === deckId);
      if (deck == null) throw new Error(`Deck not found: ${deckId}`);
      return shapeGetDeckOutput(
        {
          id: deck.id,
          title: deck.title,
          templateId: deck.templateId,
          cardCount: counts[deck.id] ?? 0,
        },
        templates,
      );
    }
    if (name === "get_template") {
      const { templateId } = ASSISTANT_TOOL_SPECS.get_template.inputSchema.parse(input);
      const templates = await data.getTemplates();
      const template = templates.find((row) => row.id === templateId);
      if (template == null) throw new Error(`Template not found: ${templateId}`);
      return shapeGetTemplateOutput(template);
    }
    if (name === "get_deck_cards") {
      const { deckId } = ASSISTANT_TOOL_SPECS.get_deck_cards.inputSchema.parse(input);
      const { deck, template } = await resolveDeckTemplate(deckId);
      const cards = await data.getCards({ deckId });
      return shapeGetDeckCardsOutput({ id: deck.id, title: deck.title, template }, cards);
    }
    if (name === "add_deck") {
      const {
        title,
        templateId,
        algorithmId: requestedAlgorithmId,
      } = ASSISTANT_TOOL_SPECS.add_deck.inputSchema.parse(input);
      const templates = await data.getTemplates();
      const template = templates.find((row) => row.id === templateId);
      if (template == null) throw new Error(`Template not found: ${templateId}`);
      const algorithmId = requestedAlgorithmId ?? (await data.getDefaultAlgorithmId());
      const algorithms = await data.getAlgorithms();
      if (!algorithms.some((row) => row.id === algorithmId)) {
        throw new Error(`Algorithm not found: ${algorithmId}`);
      }
      const created = await data.createDeck({ title, templateId, algorithmId });
      return shapeAddDeckOutput(created, template);
    }
    if (name === "propose_cards") {
      const { deckId, cards } = ASSISTANT_TOOL_SPECS.propose_cards.inputSchema.parse(input);
      const { deck, template } = await resolveDeckTemplate(deckId);
      return shapeProposeCardsOutput({ id: deck.id, title: deck.title, template }, cards);
    }
    throw new Error(`Unknown assistant tool: ${name}`);
  };
}
