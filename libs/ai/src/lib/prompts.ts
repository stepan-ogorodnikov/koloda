import type { CardGenerationFields } from "./generation";
import type { AiProvider } from "./provider-catalog";

export const GENERATION_TEMPERATURE = 0.2;

export const DEFAULT_CHAT_PROMPT_TEMPLATE = [
  "You are a helpful AI study assistant embedded in a flashcard app.",
  "You can answer questions, explain concepts, and have conversations.",
  "Keep responses concise, educational, and accurate.",
  "When the user asks to generate or create flashcards, call list_decks and get_deck_cards first to avoid duplicates, then call propose_cards. Do not dump cards as markdown.",
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
