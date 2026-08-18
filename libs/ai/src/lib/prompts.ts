import type { CardGenerationFields } from "./generation";
import type { AiProvider } from "./provider-catalog";

export const GENERATION_TEMPERATURE = 0.2;

// WHY: models misread "generate a random card" as pick-an-existing-card, or they
// ask the user for field titles instead of calling list_decks. Requiring
// get_deck_cards first made the lookup failure worse; the default must say
// invent-new and fetch titles via tools in the same turn.
export const DEFAULT_CHAT_PROMPT_TEMPLATE = [
  "You are a helpful AI study assistant embedded in a flashcard app.",
  "You can answer questions, explain concepts, have conversations, and generate new flashcards.",
  "Keep responses concise, educational, and accurate.",
  'When the user asks to generate, create, make, add, or invent flashcards — including "a random card" — call list_decks yourself for the matching deck id and field titles, then call propose_cards with original field values you invent. Do not ask the user for field titles, a deck id, or permission to list cards. That is not a request to pick or retrieve an existing card. There is no tool that selects one existing card at random or by id.',
  "Call get_deck_cards only to inspect existing cards, for example to avoid duplicates. Field titles come from list_decks, not from listing cards.",
  "After you call propose_cards, do not restate the cards in text and never write them as a markdown table. The app shows accepted cards as a review table. If the tool accepts 0 cards, call propose_cards again in this turn with cards[].fields keyed by the exact titles in the tool result. A short note that does not dump field values is fine. New cards appear only when you call propose_cards.",
].join("\n");

function buildFieldDescriptions(fields: CardGenerationFields): string {
  return fields
    .map((f) => `- "${f.id}": ${f.title} (${f.type ?? "text"}${f.isRequired ? ", required" : ", optional"})`)
    .join("\n");
}

function buildCardGenerationRules(): string {
  return [
    '- Each card must be { "content": { ... } } where each field key maps to { "text": "..." }.',
    '- "content" keys must be ONLY the field keys listed above.',
    "- Do not add extra keys, comments, explanations, markdown, headings, or prose when generating cards.",
    "- Keep text concise, educational, and accurate.",
    "- For required fields, never return empty text.",
    "- Follow the requested card count exactly when specified.",
  ].join("\n");
}

function buildMarkdownFormatInstructions(fields: CardGenerationFields): string {
  return [
    "When generating cards without structured output, format each card exactly as:",
    "## Card <number>",
    ...fields.map((field) => `**${field.title}**: <value>`),
    "Only output cards in this exact format.",
  ].join("\n");
}

function resolveProviderFormatText(fields: CardGenerationFields, provider: AiProvider | null | undefined): string {
  if (!provider || provider === "openrouter") return "";
  return buildMarkdownFormatInstructions(fields);
}

export function compilePromptTemplate(
  template: string,
  fields: CardGenerationFields,
  provider?: AiProvider | null,
): string {
  const fieldsText = buildFieldDescriptions(fields);
  const rulesText = buildCardGenerationRules();
  const providerFormatText = resolveProviderFormatText(fields, provider);

  return template
    .replace(/{{fields}}/g, fieldsText)
    .replace(/{{rules}}/g, rulesText)
    .replace(/{{provider}}/g, providerFormatText)
    .trim();
}
