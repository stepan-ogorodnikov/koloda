import {
  compilePromptTemplate,
  DEFAULT_CHAT_PROMPT_TEMPLATE,
  DEFAULT_GENERATION_PROMPT_TEMPLATE,
  getCardContentSchema,
} from "@koloda/ai";
import type {
  AIGenerationClient,
  AIModel,
  CardGenerationFields,
  CardGenerationRequest,
  ChatStreamRequest,
  GeneratedCard,
  Message,
} from "@koloda/ai";
import { AppError } from "@koloda/app";
import { z } from "zod";
import { invoke } from "../app/tauri";

type CodexGenerateCardsData = {
  prompt: string;
  modelId?: string;
  reasoningEffort?: string;
};

type CodexChatData = {
  prompt: string;
  modelId?: string;
  reasoningEffort?: string;
};

function normalizeModelId(modelId?: string) {
  return modelId && modelId !== "default" ? modelId : undefined;
}

function normalizeReasoningEffort(effort?: string) {
  return effort || undefined;
}

function getMessageText(content: string) {
  return content;
}

function buildCodexPrompt(systemPrompt: string, messages: Message[]) {
  const conversation = messages
    .map((message) => [`[${message.role.toUpperCase()}]`, getMessageText(message.content)])
    .flat()
    .join("\n");

  return [
    "You are acting as an AI harness inside a flashcard application.",
    "Do not inspect files, run shell commands, or use external tools.",
    "Answer directly from the conversation and system instructions.",
    "",
    "<system>",
    systemPrompt,
    "</system>",
    "",
    conversation ? "<conversation>" : "",
    conversation,
    conversation ? "</conversation>" : "",
    "",
    "Return only the final answer.",
  ].filter(Boolean).join("\n");
}

function buildCodexGenerationInstructions(fields: CardGenerationFields) {
  const fieldIds = fields.map((field) => `"${field.id}"`).join(", ");

  return [
    "Return only a valid JSON array.",
    "Do not wrap the JSON in markdown or code fences.",
    "Each array item must be an object with a `content` object.",
    `The only allowed content keys are: ${fieldIds}.`,
    "Each content value must be an object shaped like {\"text\":\"...\"}.",
  ].join("\n");
}

function parseGeneratedCardsText(text: string, fields: CardGenerationFields): GeneratedCard[] {
  const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = (jsonFenceMatch?.[1] ?? text).trim();
  if (!candidate) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new AppError("ai.invalid-response", "Codex returned non-JSON card output.");
  }

  const cardsSchema = z.array(getCardContentSchema(fields));
  const result = cardsSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError("ai.invalid-response", "Codex returned cards in an unexpected shape.");
  }

  return result.data;
}

async function generateCards(request: CardGenerationRequest): Promise<void> {
  const { template, input, messages = [], onCard, abortSignal, systemPromptTemplate } = request;
  const systemPrompt = [
    compilePromptTemplate(
      systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
      template.content.fields,
      "codex",
      "generation",
    ),
    buildCodexGenerationInstructions(template.content.fields),
  ].join("\n\n");
  const prompt = buildCodexPrompt(systemPrompt, [
    ...messages,
    { role: "user", content: input.prompt },
  ]);
  const result = await invoke<string>("cmd_generate_cards_with_codex", {
    data: {
      prompt,
      modelId: normalizeModelId(input.modelId),
      reasoningEffort: normalizeReasoningEffort(input.reasoningEffort),
    } satisfies CodexGenerateCardsData,
  });

  if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");

  const cards = parseGeneratedCardsText(result, template.content.fields);
  for (const card of cards) {
    if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
    onCard(card);
  }
}

async function chat(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
) {
  const systemPrompt = compilePromptTemplate(
    request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
    request.template?.content.fields ?? [],
    "codex",
    "chat",
  );
  const prompt = buildCodexPrompt(systemPrompt, request.messages);
  const text = await invoke<string>("cmd_chat_with_codex", {
    data: {
      prompt,
      modelId: normalizeModelId(request.input.modelId),
      reasoningEffort: normalizeReasoningEffort(request.input.reasoningEffort),
    } satisfies CodexChatData,
  });

  if (abortSignal.aborted) throw new DOMException("Aborted", "AbortError");
  onChunk(text);
  return undefined;
}

export async function fetchCodexModels(): Promise<AIModel[]> {
  return invoke<AIModel[]>("cmd_list_codex_models");
}

export function createCodexClient(): AIGenerationClient {
  return {
    provider: "codex",
    listModels: fetchCodexModels,
    chat,
    generateCards,
  };
}
