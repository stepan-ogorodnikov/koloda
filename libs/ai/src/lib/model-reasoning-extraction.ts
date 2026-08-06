import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { LanguageModel } from "ai";

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];

export function wrapModelWithReasoningExtraction(model: WrappableModel): LanguageModel {
  return wrapLanguageModel({
    model,
    // WHY: Some models emit CoT inside <think> tags that would otherwise leak into textStream/text.
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
}
