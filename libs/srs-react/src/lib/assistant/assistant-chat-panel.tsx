import type { AISecrets } from "@koloda/ai";
import { AIChat } from "@koloda/ai-react";

import { useAssistantChatContext } from "./assistant-chat-context";
import { AssistantSettings } from "./assistant-settings";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";

export function AssistantChatPanel() {
  const ctx = useAssistantChatContext();

  const renderMessage = useAssistantMessageRenderer({
    getGeneratedCardsProps: ctx.getGeneratedCardsProps,
    getChatMessageProps: ctx.getChatMessageProps,
  });

  return (
    <AIChat
      profileId={ctx.profileId}
      modelId={ctx.modelId}
      modelName={ctx.modelName}
      deckId={ctx.deckId}
      messages={ctx.messages}
      onProfileChange={ctx.handleProfileChange}
      onModelChange={ctx.handleModelChange}
      onSubmit={ctx.handleGenerate}
      onCancel={ctx.handleCancel}
      onReset={ctx.handleReset}
      isLoading={ctx.isGenerating}
      isModelsLoading={ctx.isModelsLoading}
      isModelsError={ctx.isModelsError}
      error={ctx.generateError?.message}
      renderMessage={renderMessage}
      mode={ctx.mode}
      onModeChange={ctx.setMode}
      modelParameters={ctx.modelParameters}
      onModelParameterChange={ctx.handleModelParameterChange}
      contextUsage={ctx.contextUsage}
      contextLength={ctx.contextLength}
      settingsPanel={
        <AssistantSettings
          template={ctx.template}
          provider={ctx.provider as AISecrets["provider"] | null}
          temperature={ctx.temperature}
          onTemperatureChange={ctx.handleTemperatureChange}
          cardsPromptTemplate={ctx.cardsPromptTemplate}
          chatPromptTemplate={ctx.chatPromptTemplate}
          onCardsPromptChange={ctx.handleCardsPromptChange}
          onChatPromptChange={ctx.handleChatPromptChange}
        />
      }
      areSettingsOpen={ctx.areSettingsOpen}
      onAreSettingsOpenChange={ctx.setAreSettingsOpen}
    />
  );
}
