import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

/**
 * Assistant chat tool registry — specs and binder only, no I/O (layer map: libs/ai
 * owns the contract; hosts bind executors per tool name). Adding a tool is one
 * entry here plus one executor in each host.
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
  /** True when the card list was truncated at the per-deck cap owned by executors. */
  isCapped: boolean;
  cards: Array<{ fields: Record<string, string> }>;
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
