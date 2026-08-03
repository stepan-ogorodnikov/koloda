import type { AssistantSettings } from "@koloda/ai";
import { queriesAtom } from "@koloda/core-react";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import type { RefObject } from "react";
import type { AssistantConversationConfig } from "./state/assistant-conversation-config";
import { assistantDeckIdAtom } from "./state/conversation-selectors";
import { useAssistantClient } from "./use-assistant-client";

export type UseAssistantRuntimeConfigOptions = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  reasoningEffort: string;
};

export type UseAssistantRuntimeConfigReturn = {
  template: AssistantConversationConfig["template"];
  templateId: AssistantConversationConfig["templateId"] | undefined;
  configRef: RefObject<AssistantConversationConfig>;
};

export function useAssistantRuntimeConfig({
  profileId,
  modelId,
  modelName,
  reasoningEffort,
}: UseAssistantRuntimeConfigOptions): UseAssistantRuntimeConfigReturn {
  const { _ } = useLingui();
  const { getDeckQuery, getTemplateQuery, getSettingsQuery } = useAtomValue(queriesAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);
  const { data: aiSettings } = useQuery(getSettingsQuery("ai"));
  const assistantSettings = aiSettings?.content?.assistant as AssistantSettings | undefined;
  const temperature = assistantSettings?.temperature ?? 0.2;

  const deckQuery = useQuery({
    ...getDeckQuery(deckId!),
    enabled: !!deckId,
  });
  const templateId = deckQuery.data?.templateId;

  const templateQuery = useQuery({
    ...getTemplateQuery(templateId!),
    enabled: !!templateId,
  });
  const template = templateQuery.data;

  const { streamGenerator, chatStreamGenerator } = useAssistantClient({ profileId, template });

  const cardsPromptTemplate = assistantSettings?.cardsPromptTemplate ?? null;
  const chatPromptTemplate = assistantSettings?.chatPromptTemplate ?? null;

  const conversationConfig: AssistantConversationConfig = {
    profileId,
    modelId,
    modelName,
    temperature,
    reasoningEffort,
    deckId: deckId!,
    templateId: templateId!,
    streamGenerator,
    chatStreamGenerator,
    template,
    cardsPromptTemplate,
    chatPromptTemplate,
    _,
  };

  const configRef = useRef(conversationConfig);
  configRef.current = conversationConfig;

  return { template, templateId, configRef };
}
