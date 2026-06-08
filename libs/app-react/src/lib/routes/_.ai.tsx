import { AIChat } from "@koloda/ai-react";
import type { AISecrets } from "@koloda/ai";
import { queryKeys, useTitle } from "@koloda/core-react";
import { AIChatSettings, useAIChatMessageRenderer, useAIChatPage } from "@koloda/srs-react";
import { Layout, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    deckId: search.deckId ? Number(search.deckId) : undefined,
    templateId: search.templateId ? Number(search.templateId) : undefined,
  }),
  loader: ({ context: { queryClient, queries } }) => {
    const { getAIProfilesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.ai.profiles(), ...getAIProfilesQuery() });
    return { title: msg`title.ai` };
  },
});

function AIRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { deckId, templateId } = Route.useSearch();
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  const {
    profileId,
    modelId,
    modelName,
    provider,
    temperature,
    modelParameters,
    messages,
    template,
    isModelsLoading,
    isModelsError,
    isGenerating,
    generateError,
    mode,
    setMode,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    getGeneratedCardsProps,
    getChatMessageProps,
    contextUsage,
    contextLength,
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  } = useAIChatPage(deckId, templateId);

  const renderMessage = useAIChatMessageRenderer({
    getGeneratedCardsProps,
    getChatMessageProps,
  });

  return (
    <>
      <Layout.Sidebar />
      <Layout.Content isAlwaysVisible>
        <Layout.Container ref={ref} tabIndex={-1}>
          <AIChat
            profileId={profileId}
            modelId={modelId}
            modelName={modelName}
            messages={messages}
            onProfileChange={handleProfileChange}
            onModelChange={handleModelChange}
            onSubmit={handleGenerate}
            onCancel={handleCancel}
            onReset={handleReset}
            isLoading={isGenerating}
            isModelsLoading={isModelsLoading}
            isModelsError={isModelsError}
            error={generateError?.message}
            renderMessage={renderMessage}
            mode={mode}
            onModeChange={setMode}
            modelParameters={modelParameters}
            onModelParameterChange={handleModelParameterChange}
            contextUsage={contextUsage}
            contextLength={contextLength}
            settingsPanel={
              <AIChatSettings
                template={template}
                provider={provider as AISecrets["provider"] | null}
                temperature={temperature}
                onTemperatureChange={handleTemperatureChange}
                cardsPromptTemplate={cardsPromptTemplate}
                chatPromptTemplate={chatPromptTemplate}
                onCardsPromptChange={handleCardsPromptChange}
                onChatPromptChange={handleChatPromptChange}
              />
            }
            settingsPanelOpen={settingsPanelOpen}
            onSettingsPanelOpenChange={setSettingsPanelOpen}
          />
        </Layout.Container>
      </Layout.Content>
    </>
  );
}
