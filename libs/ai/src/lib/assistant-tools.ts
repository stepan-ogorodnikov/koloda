import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { GeneratedCard } from "./generation";

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

/** Host field type — mirrors SRS `"text" | "markdown"` without importing `@koloda/srs`. */
export type AssistantToolFieldType = "text" | "markdown";

/** Accepted `propose_cards` payload; `fields` is title-keyed like `get_deck_cards`. */
export type ProposeCardsOutput = {
  deckId: number;
  deckTitle: string;
  templateFields: Array<{ id: number; title: string; type: AssistantToolFieldType; isRequired: boolean }>;
  cards: Array<{ fields: Record<string, string> }>;
  rejectedCount: number;
  message?: string;
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
  content: { fields: Array<{ id: number; title: string; type: AssistantToolFieldType; isRequired: boolean }> };
};

/** Structural deck + template subset for `get_deck_cards` and `propose_cards`. */
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

// WHY: weaker models omit the `fields` wrapper, send `{ text }` values, or call
// with an empty cards array and then dump a markdown table instead.
function coerceFieldRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const mapped: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      mapped[key] = entry;
      continue;
    }
    if (isPlainObject(entry) && typeof entry.text === "string") {
      mapped[key] = entry.text;
      continue;
    }
    return null;
  }
  return mapped;
}

function coerceProposeCard(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if ("fields" in value) {
    const fields = coerceFieldRecord(value.fields);
    return fields == null ? value : { fields };
  }
  const fields = coerceFieldRecord(value);
  return fields == null ? value : { fields };
}

const proposeCardSchema = z.preprocess(coerceProposeCard, z.object({ fields: z.record(z.string(), z.string()) }));

export const PROPOSE_CARDS_RETRY_MESSAGE =
  "No cards accepted. Call propose_cards again with cards[].fields keyed by the exact titles in templateFields. Do not write the cards as markdown.";

export const ASSISTANT_TOOL_SPECS = {
  list_decks: {
    name: "list_decks",
    description:
      "List the user's flashcard decks: deck id, deck title, card count, and the template's title and field titles. Call this when you need a deck id or field titles, including before propose_cards. Do not ask the user for field titles. This tool does not create cards.",
    inputSchema: z.object({}),
  },
  get_deck_cards: {
    name: "get_deck_cards",
    description:
      "Get the existing cards of one deck by deck id (as reported by list_decks), as field-title-to-text pairs. Large decks are capped. Use this only to inspect existing cards, for example to avoid duplicates. Field titles come from list_decks, not from this tool. This cannot pick a single random card, cannot fetch one card by id, and cannot create cards.",
    inputSchema: z.object({
      deckId: z.int().positive(),
    }),
  },
  propose_cards: {
    name: "propose_cards",
    description:
      "Create new flashcards for a deck. Call this whenever the user asks to generate, create, make, add, or invent cards, including a random card — invent original field values; do not copy or pick existing cards. If you lack the deck id or field titles, call list_decks first in this turn; do not ask the user. deckId is the target deck from list_decks. Each cards item must include fields: a map of exact template field title to invented text. An empty cards array does not create cards. If the result accepts 0 cards, call this tool again with the titles in templateFields; never write cards as a markdown table.",
    inputSchema: z.object({
      deckId: z.int().positive(),
      cards: z.array(proposeCardSchema).min(1),
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

/**
 * Shape `propose_cards` output from a loaded deck+template and title-keyed input
 * cards. Invalid, empty, and over-cap cards are dropped — never a thrown error.
 */
export function shapeProposeCardsOutput(
  deck: AssistantDeckCardsSource,
  cards: Array<{ fields: Record<string, string> }>,
): ProposeCardsOutput {
  const templateFields = deck.template.content.fields;
  const accepted: ProposeCardsOutput["cards"] = [];
  let rejectedCount = 0;
  for (const card of cards) {
    const fields = shapeProposedCardFields(card.fields, templateFields);
    if (fields == null) {
      rejectedCount += 1;
      continue;
    }
    // WHY: extras past the per-deck cap count as rejected so the model sees how
    // many proposals were dropped without failing the tool run.
    if (accepted.length >= ASSISTANT_TOOL_MAX_CARDS_PER_DECK) {
      rejectedCount += 1;
      continue;
    }
    accepted.push({ fields });
  }

  return {
    deckId: deck.id,
    deckTitle: deck.title,
    templateFields: templateFields.map((field) => ({
      id: field.id,
      title: field.title,
      type: field.type,
      isRequired: field.isRequired,
    })),
    cards: accepted,
    rejectedCount,
    ...(accepted.length === 0 && cards.length > 0 ? { message: PROPOSE_CARDS_RETRY_MESSAGE } : {}),
  };
}

function lookupProposedFieldText(inputFields: Record<string, string>, field: { id: number; title: string }): string {
  const exact = inputFields[field.title];
  if (exact !== undefined) return exact.trim();
  const byId = inputFields[String(field.id)];
  if (byId !== undefined) return byId.trim();
  const lower = field.title.toLowerCase();
  for (const [key, value] of Object.entries(inputFields)) {
    if (key.toLowerCase() === lower) return value.trim();
  }
  return "";
}

function shapeProposedCardFields(
  inputFields: Record<string, string>,
  fields: AssistantToolTemplate["content"]["fields"],
): Record<string, string> | null {
  const mapped: Record<string, string> = {};
  let hasNonEmpty = false;
  let isMissingRequired = false;
  for (const field of fields) {
    // WHY: models often send lowercase titles or field ids instead of the exact
    // titles from list_decks; exact match still wins so colliding titles stay stable.
    const text = lookupProposedFieldText(inputFields, field);
    mapped[field.title] = text;
    if (text.length > 0) hasNonEmpty = true;
    else if (field.isRequired) isMissingRequired = true;
  }
  if (!hasNonEmpty || isMissingRequired) return null;
  return mapped;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isAssistantToolFieldType(value: unknown): value is AssistantToolFieldType {
  return value === "text" || value === "markdown";
}

function isProposeCardsTemplateField(value: unknown): value is ProposeCardsOutput["templateFields"][number] {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "number" &&
    Number.isInteger(value.id) &&
    typeof value.title === "string" &&
    isAssistantToolFieldType(value.type) &&
    typeof value.isRequired === "boolean"
  );
}

function isProposeCardsCard(value: unknown): value is ProposeCardsOutput["cards"][number] {
  if (!isPlainObject(value)) return false;
  return isStringRecord(value.fields);
}

export function isProposeCardsOutput(value: unknown): value is ProposeCardsOutput {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.deckId === "number" &&
    Number.isInteger(value.deckId) &&
    value.deckId > 0 &&
    typeof value.deckTitle === "string" &&
    Array.isArray(value.templateFields) &&
    value.templateFields.every(isProposeCardsTemplateField) &&
    Array.isArray(value.cards) &&
    value.cards.every(isProposeCardsCard) &&
    typeof value.rejectedCount === "number" &&
    Number.isInteger(value.rejectedCount) &&
    (value.message === undefined || typeof value.message === "string")
  );
}

// WHY: hosts and the model speak field titles; GeneratedCard content is keyed
// by field id. Mapping lives here so srs-react does not duplicate the table.
export function generatedCardsFromProposeOutput(output: ProposeCardsOutput): GeneratedCard[] {
  return output.cards.map((card) => ({
    content: Object.fromEntries(
      output.templateFields.map((field) => [String(field.id), { text: card.fields[field.title] ?? "" }]),
    ),
  }));
}
