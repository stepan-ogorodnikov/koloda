import type { I18nContext } from "@lingui/react";

export type AssistantConversationConfig = {
  profileId: string;
  modelId: string;
  modelName?: string;
  temperature: number;
  reasoningEffort: string;
  chatPromptTemplate: string | null;
  _: I18nContext["_"];
};
