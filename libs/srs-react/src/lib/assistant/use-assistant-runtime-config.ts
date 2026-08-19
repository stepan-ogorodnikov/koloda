import type { AssistantSettings } from "@koloda/ai";
import { queriesAtom } from "@koloda/core-react";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { RefObject } from "react";
import { useRef } from "react";
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
  const { _ } = useLingui();
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data: aiSettings } = useQuery(getSettingsQuery("ai"));
  const assistantSettings = aiSettings?.content?.assistant as AssistantSettings | undefined;
  const temperature = assistantSettings?.temperature ?? 0.2;
  const chatPromptTemplate = assistantSettings?.chatPromptTemplate ?? null;

  const conversationConfig: AssistantConversationConfig = {
    profileId,
    modelId,
    modelName,
    temperature,
    reasoningEffort,
    chatPromptTemplate,
    _,
  };

  const configRef = useRef(conversationConfig);
  configRef.current = conversationConfig;

  return { configRef };
}
