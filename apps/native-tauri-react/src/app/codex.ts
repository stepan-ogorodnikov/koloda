import type { AIRuntime, AIRuntimeGenerateCardsRequest } from "@koloda/react-base";
import {
  compilePromptTemplate,
  DEFAULT_CHAT_PROMPT_TEMPLATE,
  DEFAULT_GENERATION_PROMPT_TEMPLATE,
  getCardContentSchema,
} from "@koloda/srs";
import { AppError } from "@koloda/srs";
import type { ChatStreamRequest, GeneratedCard, Template } from "@koloda/srs";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { invoke } from "./tauri";

const DEFAULT_CODEX_MODEL_ID = "gpt-5.4";

type CodexGenerateCardsData = {
  prompt: string;
  modelId?: string;
};

type CodexChatData = {
  prompt: string;
  modelId?: string;
};

function normalizeModelId(modelId?: string) {
  return modelId && modelId !== "default" ? modelId : DEFAULT_CODEX_MODEL_ID;
}

function getMessageText(content: ModelMessage["content"]) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if ("text" in part && typeof part.text === "string") return part.text;
        return JSON.stringify(part);
      })
      .join("\n");
  }

  return String(content);
}

function buildCodexPrompt(systemPrompt: string, messages: ModelMessage[]) {
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

function buildCodexGenerationInstructions(template: Template) {
  const fieldIds = template.content.fields.map((field) => `"${field.id}"`).join(", ");

  return [
    "Return only a valid JSON array.",
    "Do not wrap the JSON in markdown or code fences.",
    "Each array item must be an object with a `content` object.",
    `The only allowed content keys are: ${fieldIds}.`,
    "Each content value must be an object shaped like {\"text\":\"...\"}.",
  ].join("\n");
}

function parseGeneratedCardsText(text: string, template: Template): GeneratedCard[] {
  const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = (jsonFenceMatch?.[1] ?? text).trim();
  if (!candidate) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new AppError("ai.invalid-response", "Codex returned non-JSON card output.");
  }

  const cardsSchema = z.array(getCardContentSchema(template.content.fields));
  const result = cardsSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError("ai.invalid-response", "Codex returned cards in an unexpected shape.");
  }

  return result.data;
}

async function generateCards(
  request: AIRuntimeGenerateCardsRequest,
  onCard: (card: GeneratedCard) => void,
  signal: AbortSignal,
) {
  const systemPrompt = [
    compilePromptTemplate(
      request.systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
      request.template.content.fields,
      "codex",
      "generation",
    ),
    buildCodexGenerationInstructions(request.template),
  ].join("\n\n");
  const prompt = buildCodexPrompt(systemPrompt, [
    ...request.messages,
    { role: "user", content: request.input.prompt },
  ]);
  const result = await invoke<string>("cmd_generate_cards_with_codex", {
    data: {
      prompt,
      modelId: normalizeModelId(request.input.modelId),
    } satisfies CodexGenerateCardsData,
  });

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const cards = parseGeneratedCardsText(result, request.template);
  for (const card of cards) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    onCard(card);
  }
}

async function chat(request: ChatStreamRequest, onChunk: (chunk: string) => void, signal: AbortSignal) {
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
    } satisfies CodexChatData,
  });

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  onChunk(text);
}

export const codexRuntime: AIRuntime = {
  supportedProviders: ["codex"],
  generateCards,
  chat,
};
