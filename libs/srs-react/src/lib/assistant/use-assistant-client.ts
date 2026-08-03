import type { ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import type { CardGenerationExecutor } from "@koloda/ai-react";
import { aiRuntimeAtom } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { useAtomValue } from "jotai";
import { useCallback } from "react";

export type UseAssistantClientOptions = {
  profileId: string;
  template: Template | null | undefined;
};

export type UseAssistantClientReturn = {
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
};

export function useAssistantClient({ profileId, template }: UseAssistantClientOptions): UseAssistantClientReturn {
  const aiRuntime = useAtomValue(aiRuntimeAtom);

  const streamGenerator = useCallback<CardGenerationExecutor>(
    async (request, onCard, abortSignal) => {
      if (!profileId) throw new Error("No AI profile selected");
      if (!template) throw new Error("No template loaded");

      await aiRuntime.generateCards(profileId, {
        template,
        input: request.input,
        messages: request.messages,
        onCard,
        abortSignal,
        systemPromptTemplate: request.systemPromptTemplate,
      });
    },
    [aiRuntime, profileId, template],
  );

  const chatStreamGenerator = useCallback(
    async (request: ChatStreamRequest, onChunk: (chunk: string) => void, abortSignal: AbortSignal) => {
      if (!profileId) throw new Error("No AI profile selected");
      return await aiRuntime.chat(profileId, request, onChunk, abortSignal);
    },
    [aiRuntime, profileId],
  );

  return { streamGenerator, chatStreamGenerator };
}
