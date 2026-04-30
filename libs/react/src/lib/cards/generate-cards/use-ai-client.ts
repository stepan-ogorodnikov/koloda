import type { AIProfile, ChatStreamGenerator, ChatStreamRequest, Template } from "@koloda/srs";
import { createAIGenerationClient, getProviderConfig } from "@koloda/srs";
import type { AIRuntime } from "@koloda/react-base";
import { useCallback } from "react";
import type { StreamGenerator } from "./use-generate-cards";

export type UseAIClientOptions = {
  selectedProfile: AIProfile | null;
  aiRuntime: AIRuntime | undefined;
  template: Template | null | undefined;
};

export type UseAIClientReturn = {
  streamGenerator: StreamGenerator;
  chatStreamGenerator: ChatStreamGenerator;
};

export function useAIClient({
  selectedProfile,
  aiRuntime,
  template,
}: UseAIClientOptions): UseAIClientReturn {
  const streamGenerator = useCallback<StreamGenerator>(
    async (request, onCard, abortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");
      if (!template) throw new Error("No template loaded");

      const providerConfig = getProviderConfig(selectedProfile.secrets.provider);

      if (providerConfig.requiresNativeRuntime) {
        if (!aiRuntime?.generateCards) throw new Error("Codex provider requires the native app runtime.");
        await aiRuntime.generateCards(
          {
            input: request.input,
            messages: request.messages,
            template,
            systemPromptTemplate: request.systemPromptTemplate,
          },
          onCard,
          abortSignal,
        );
        return;
      }

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
    [aiRuntime, selectedProfile, template],
  );

  const chatStreamGenerator = useCallback(
    async (request: ChatStreamRequest, onChunk: (chunk: string) => void, abortSignal: AbortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");

      const providerConfig = getProviderConfig(selectedProfile.secrets.provider);

      if (providerConfig.requiresNativeRuntime) {
        if (!aiRuntime?.chat) throw new Error("Codex provider requires the native app runtime.");
        await aiRuntime.chat(request, onChunk, abortSignal);
        return;
      }

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.chat(request, onChunk, abortSignal);
    },
    [aiRuntime, selectedProfile],
  );

  return { streamGenerator, chatStreamGenerator };
}
