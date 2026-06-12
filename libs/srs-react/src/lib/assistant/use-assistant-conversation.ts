import type { ChatStreamGenerator } from "@koloda/ai";
import type { Deck, Template } from "@koloda/srs";
import type { I18nContext } from "@lingui/react";
import type { CardGenerationExecutor } from "./use-assistant-card-generation";

export type AssistantConversationConfig = {
  profileId: string;
  modelId: string;
  temperature: number;
  reasoningEffort: string;
  deckId: Deck["id"];
  templateId: Template["id"];
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
  template: Template | null | undefined;
  touchProfileMutate: (args: { id: string; modelId: string }) => void;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  _: I18nContext["_"];
};
