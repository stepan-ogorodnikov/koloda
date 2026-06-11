import type { AIProfile, ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import { createAIGenerationClient } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { useCallback } from "react";
import type { CardGenerationExecutor } from "./use-assistant-card-generation";

export type UseAssistantClientOptions = {
  selectedProfile: AIProfile | null;
  template: Template | null | undefined;
};

export type UseAssistantClientReturn = {
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
};

export function useAssistantClient({
  selectedProfile,
  template,
}: UseAssistantClientOptions): UseAssistantClientReturn {
  const streamGenerator = useCallback<CardGenerationExecutor>(
    async (request, onCard, abortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");
      if (!template) throw new Error("No template loaded");

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.generateCards({
        template,
        input: request.input,
        messages: request.messages,
        onCard,
        abortSignal,
        systemPromptTemplate: request.systemPromptTemplate,
      });
    },
    [selectedProfile, template],
  );

  const chatStreamGenerator = useCallback(
    async (request: ChatStreamRequest, onChunk: (chunk: string) => void, abortSignal: AbortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");

      const client = createAIGenerationClient(selectedProfile.secrets);
      return await client.chat(request, onChunk, abortSignal);
    },
    [selectedProfile],
  );

  return { streamGenerator, chatStreamGenerator };
}
