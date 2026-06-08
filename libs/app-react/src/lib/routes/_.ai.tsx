import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AISecrets } from "@koloda/ai";
import { AIChat } from "@koloda/ai-react";
import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { AIChatSettings, DeckPicker, useAIChatMessageRenderer, useAIChatPage } from "@koloda/srs-react";
import { Button, Layout, Tooltip, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";

export const Route = createFileRoute("/_/ai")({
  component: AIRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    deckId: search.deckId ? Number(search.deckId) : undefined,
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
  const { _ } = useLingui();
  const navigate = useNavigate();
  const { deckId } = Route.useSearch();
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const deckQuery = useQuery({
    queryKey: queryKeys.decks.detail(deckId!),
    ...getDeckQuery(deckId!),
    enabled: !!deckId,
  });
  const templateId = deckQuery.data?.templateId;

  const handleDeckChange = useCallback((id: number) => {
    navigate({ search: { deckId: id } as any });
  }, [navigate]);

  const handleClearDeck = useCallback(() => {
    navigate({ search: {} as any });
  }, [navigate]);

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
        <Layout.Header variants={{ class: "justify-center" }}>
          <div className="flex flex-row flex-wrap items-center w-full max-w-3xl">
            <Layout.H1>{_(msg`title.ai`)}</Layout.H1>
            <div className="flex flex-row items-center gap-1 pl-2">
              <DeckPicker
                variants={{ class: "flex-row items-center gap-2" }}
                labelVariants={{ class: "fg-level-2 font-medium" }}
                buttonVariants={{ class: "min-w-48 wd:min-w-60" }}
                value={deckId ?? null}
                onChange={handleDeckChange}
                isNullable
              />
              <Tooltip content={_(msg`ai.deck-picker.clear`)} isDisabled={!deckId}>
                <Button
                  variants={{ style: "ghost", size: "smallIcon" }}
                  aria-label={_(msg`ai.deck-picker.clear`)}
                  isDisabled={!deckId}
                  onPress={handleClearDeck}
                >
                  <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Cancel01Icon} aria-hidden="true" />
                </Button>
              </Tooltip>
            </div>
          </div>
        </Layout.Header>
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
