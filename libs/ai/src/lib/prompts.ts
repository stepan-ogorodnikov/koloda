import type { AiProvider, CardGenerationFields } from "./types";

function buildFieldDescriptions(fields: CardGenerationFields): string {
  return fields
    .map((f) => `- "${f.id}": ${f.title} (${f.type ?? "text"}${f.isRequired ? ", required" : ", optional"})`)
    .join("\n");
}

function buildCardGenerationRules(context: "structured" | "assistant"): string {
  const noExtras = context === "assistant"
    ? "- Do not add extra keys, comments, explanations, markdown, headings, or prose when generating cards."
    : "- Do not add extra keys, comments, explanations, markdown, headings, or prose.";

  const rules = [
    "- Each card must be { \"content\": { ... } } where each field key maps to { \"text\": \"...\" }.",
    "- \"content\" keys must be ONLY the field keys listed above.",
    noExtras,
    "- Keep text concise, educational, and accurate.",
    "- For required fields, never return empty text.",
    "- Follow the requested card count exactly when specified.",
  ];

  if (context === "structured") {
    rules.unshift("- Output must match the provided schema exactly.");
  }

  return rules.join("\n");
}

function buildMarkdownFormatInstructions(fields: CardGenerationFields): string {
  return [
    "When generating cards without structured output, format each card exactly as:",
    "## Card <number>",
    ...fields.map((field) => `**${field.title}**: <value>`),
    "Only output cards in this exact format.",
  ].join("\n");
}

export function buildSystemPrompt(fields: CardGenerationFields, providerPrompt = ""): string {
  const corePrompt = [
    "You are a flashcard generator that must produce strictly structured flashcard data.",
    "The flashcards have the following fields:",
    buildFieldDescriptions(fields),
    "Rules:",
    buildCardGenerationRules("structured"),
  ].join("\n");

  return providerPrompt ? `${corePrompt}\n\n${providerPrompt}` : corePrompt;
}

export function buildProviderFormatPrompt(fields: CardGenerationFields) {
  return ["Provider-specific format instructions:", buildMarkdownFormatInstructions(fields)].join("\n");
}

export function buildSystemPromptForProvider(fields: CardGenerationFields, provider?: AiProvider | null) {
  if (!provider || provider === "openrouter" || provider === "codex") return buildSystemPrompt(fields);
  return buildSystemPrompt(fields, buildProviderFormatPrompt(fields));
}

export function buildAssistantSystemPrompt(fields: CardGenerationFields, provider?: AiProvider | null): string {
  const formatInstructions = provider && provider !== "openrouter" && provider !== "codex"
    ? "\n\n" + buildMarkdownFormatInstructions(fields)
    : "";

  return [
    "You are a helpful AI study assistant embedded in a flashcard app.",
    "You can answer questions, explain concepts, and have conversations.",
    "When the user asks you to generate flashcards, you must produce structured card data.",
    "",
    "The flashcards have the following fields:",
    buildFieldDescriptions(fields),
    "",
    "Rules for card generation:",
    buildCardGenerationRules("assistant"),
    formatInstructions,
  ].filter(Boolean).join("\n");
}

function resolveProviderFormatText(
  fields: CardGenerationFields,
  provider: AiProvider | null | undefined,
  mode: "generation" | "chat",
): string {
  if (!provider || provider === "openrouter" || provider === "codex") return "";
  if (mode === "generation") {
    return buildProviderFormatPrompt(fields);
  }
  return buildMarkdownFormatInstructions(fields);
}

export function compilePromptTemplate(
  template: string,
  fields: CardGenerationFields,
  provider?: AiProvider | null,
  mode: "generation" | "chat" = "generation",
): string {
  const fieldsText = buildFieldDescriptions(fields);
  const rulesText = buildCardGenerationRules(mode === "generation" ? "structured" : "assistant");
  const providerFormatText = resolveProviderFormatText(fields, provider, mode);

  return template
    .replace(/{{fields}}/g, fieldsText)
    .replace(/{{rules}}/g, rulesText)
    .replace(/{{provider}}/g, providerFormatText)
    .trim();
}
