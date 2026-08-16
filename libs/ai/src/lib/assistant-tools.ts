import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

/**
 * Assistant chat tool registry — specs, binder, and pure output shaping, no I/O
 * (layer map: libs/ai owns the contract; hosts bind executors per tool name).
 * Adding a tool is one entry here plus one executor in each host.
 */

/** Deck summary row returned by `list_decks`. */
export type ListDecksOutput = {
  decks: Array<{
    deckId: number;
    title: string;
    cardCount: number;
    /** Null mirrors the v1 data-access manifest: the deck's template was not among the resolved set. */
    templateTitle: string | null;
    fieldTitles: string[];
  }>;
};

/** Card payload returned by `get_deck_cards`; `fields` maps template field titles to card text. */
export type GetDeckCardsOutput = {
  deckTitle: string;
  totalCards: number;
  /** True when fewer cards are returned than the deck holds (per-deck cap or char budget). */
  isCapped: boolean;
  cards: Array<{ fields: Record<string, string> }>;
};

// WHY: hard card cap bounds serialization work and prompt growth before character
// accounting starts; `totalCards` keeps the true deck size visible to the model.
export const ASSISTANT_TOOL_MAX_CARDS_PER_DECK = 200;

// WHY: character ceiling keeps the serialized card list near ~2k tokens, so a tool
// result never crowds out the conversation in smaller context windows.
export const ASSISTANT_TOOL_CARD_LIST_CHAR_BUDGET = 8_000;

/** Structural deck row subset for `list_decks`; the host resolves `cardCount` (per-deck card reads). */
export type AssistantDeckSummarySource = {
  id: number;
  title: string;
  templateId: number;
  cardCount: number;
};

/** Structural template subset — field titles map card content keys to output keys. */
export type AssistantToolTemplate = {
  id: number;
  title: string;
  content: { fields: Array<{ id: number; title: string }> };
};

/** Structural deck + template subset for `get_deck_cards`. */
export type AssistantDeckCardsSource = {
  id: number;
  title: string;
  template: AssistantToolTemplate;
};

/** Structural card subset — only content is serialized; FSRS state never leaves the host. */
export type AssistantToolCard = {
  content: Record<string, { text: string }>;
};

export type AssistantToolSpec = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
};

export const ASSISTANT_TOOL_SPECS = {
  list_decks: {
    name: "list_decks",
    description:
      "List the user's flashcard decks: deck id, deck title, card count, and the template's title and field titles. Call this first when the user asks about their decks or cards.",
    inputSchema: z.object({}),
  },
  get_deck_cards: {
    name: "get_deck_cards",
    description:
      "Get the existing cards of one deck by deck id (as reported by list_decks), as field-title-to-text pairs. Large decks are capped.",
    inputSchema: z.object({
      deckId: z.int().positive(),
    }),
  },
} as const satisfies Record<string, AssistantToolSpec>;

export type AssistantToolName = keyof typeof ASSISTANT_TOOL_SPECS;

/**
 * Tool activity during a chat run, shaped to map one-to-one onto the run-record
 * tool chunk kinds planned for the engine protocol — hosts forward it unchanged.
 */
export type AssistantToolEvent =
  | { kind: "toolCall"; call: { id: string; name: string; input: unknown } }
  | { kind: "toolResult"; callId: string; output?: unknown; error?: unknown };

export type OnToolEvent = (event: AssistantToolEvent) => void;

/** Host-supplied dispatcher: resolves a bound tool by name and returns its output. */
export type AssistantToolExecutor = (name: string, input: unknown) => Promise<unknown>;

export type BindAssistantToolsOptions = {
  /** Tool names to expose to the model; selects from `ASSISTANT_TOOL_SPECS`. */
  names: string[];
  execute: AssistantToolExecutor;
};

/** Bind named tool specs to a host executor as an AI SDK `tools` object for `streamText`. */
export function bindAssistantTools({ names, execute }: BindAssistantToolsOptions): ToolSet {
  const bound: ToolSet = {};
  for (const name of names) {
    const spec = ASSISTANT_TOOL_SPECS[name as AssistantToolName];
    // WHY: throw instead of filtering — a silently dropped tool would degrade the run
    // without a trace; an unknown name means a typo'd request or a stale registry.
    if (spec == null) throw new Error(`Unknown assistant tool: ${name}`);
    // WHY: explicit generics — spec schemas are a heterogeneous union, so tool()'s
    // INPUT inference cannot resolve; the dispatcher is untyped at this seam anyway.
    bound[name] = tool<unknown, unknown>({
      description: spec.description,
      inputSchema: spec.inputSchema,
      execute: async (input) => execute(name, input),
    });
  }
  return bound;
}

/**
 * Shape `list_decks` output from deck rows, template rows, and host-resolved card
 * counts. A deck whose template is not among the rows keeps a null `templateTitle`
 * and no field titles — never a silent drop.
 */
export function shapeListDecksOutput(
  decks: AssistantDeckSummarySource[],
  templates: AssistantToolTemplate[],
): ListDecksOutput {
  return {
    decks: decks.map((deck) => {
      const template = templates.find((row) => row.id === deck.templateId) ?? null;
      return {
        deckId: deck.id,
        title: deck.title,
        cardCount: deck.cardCount,
        templateTitle: template?.title ?? null,
        fieldTitles: template ? template.content.fields.map((field) => field.title) : [],
      };
    }),
  };
}

/**
 * Shape `get_deck_cards` output, applying the per-deck cap and the serialized-char
 * budget; `totalCards`/`isCapped` always report the deck's real size.
 */
export function shapeGetDeckCardsOutput(
  deck: AssistantDeckCardsSource,
  cards: AssistantToolCard[],
): GetDeckCardsOutput {
  const fields = deck.template.content.fields;
  const capped = cards.slice(0, ASSISTANT_TOOL_MAX_CARDS_PER_DECK);
  const listed: GetDeckCardsOutput["cards"] = [];
  let usedChars = 0;
  for (const card of capped) {
    const entry = { fields: shapeCardFields(card, fields) };
    // WHY: the model consumes tool output as JSON, so the budget is spent on what is
    // actually serialized (entry length plus array separator), not a parallel rendering.
    const cost = JSON.stringify(entry).length + (listed.length > 0 ? 1 : 0);
    if (usedChars + cost > ASSISTANT_TOOL_CARD_LIST_CHAR_BUDGET) break;
    usedChars += cost;
    listed.push(entry);
  }

  return {
    deckTitle: deck.title,
    totalCards: cards.length,
    isCapped: listed.length < cards.length,
    cards: listed,
  };
}

/** Field ids are the card content keys; the output is keyed by field title. */
function shapeCardFields(
  card: AssistantToolCard,
  fields: Array<{ id: number; title: string }>,
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.title, card.content[String(field.id)]?.text ?? ""]));
}
