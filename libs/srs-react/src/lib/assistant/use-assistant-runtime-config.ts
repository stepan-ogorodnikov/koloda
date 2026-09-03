import type { AssistantSettings } from "@koloda/ai";
import { resolveEffectiveChatPromptTemplate } from "@koloda/ai";
import { queriesAtom } from "@koloda/core-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import type { AssistantConversationConfig } from "./state/assistant-conversation-config";

export type UseAssistantRuntimeConfigOptions = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  reasoningEffort: string;
};

export type UseAssistantRuntimeConfigReturn = {
  configRef: RefObject<AssistantConversationConfig>;
};

export function useAssistantRuntimeConfig({
  profileId,
  modelId,
  modelName,
  reasoningEffort,
}: UseAssistantRuntimeConfigOptions): UseAssistantRuntimeConfigReturn {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data: aiSettings } = useQuery(getSettingsQuery("ai"));
  const assistantSettings = aiSettings?.content?.assistant as AssistantSettings | undefined;
  const temperature = assistantSettings?.temperature ?? 0.2;
  const chatPromptTemplate = resolveEffectiveChatPromptTemplate(assistantSettings ?? {});

  const conversationConfig: AssistantConversationConfig = {
    profileId,
    modelId,
    modelName,
    temperature,
    reasoningEffort,
    chatPromptTemplate,
  };

  // WHY: keep the ref write in a layout effect (not render) so a concurrent
  // render cannot mutate the shared ref mid-commit; consumers read it from
  // event handlers, which always run after layout effects.
  const configRef = useRef(conversationConfig);
  useLayoutEffect(() => {
    configRef.current = conversationConfig;
  });

  return { configRef };
}
