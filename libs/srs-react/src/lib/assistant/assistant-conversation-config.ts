import type { ChatStreamGenerator } from "@koloda/ai";
import type { CardGenerationExecutor } from "@koloda/ai-react";
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
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
  template: Template | null | undefined;
  touchProfileMutate: (args: { id: string; modelId: string }) => void;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  _: I18nContext["_"];
};
