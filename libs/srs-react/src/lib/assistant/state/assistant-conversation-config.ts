import type { Deck, Template } from "@koloda/srs";
import type { I18nContext } from "@lingui/react";

export type AssistantConversationConfig = {
  profileId: string;
  modelId: string;
  modelName?: string;
  temperature: number;
  reasoningEffort: string;
  deckId: Deck["id"];
  templateId: Template["id"];
  template: Template | null | undefined;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  _: I18nContext["_"];
};
