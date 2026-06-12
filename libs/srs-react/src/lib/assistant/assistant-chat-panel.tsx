import type { AISecrets } from "@koloda/ai";
import {
  AIChatError,
  AIChatFooter,
  AIChatMessages,
  AIChatMissingSecrets,
  AIChatModeToggle,
  AIChatPromptInput,
  AIChatSettingsToggle,
  AIChatSubmit,
  AIModelParameters,
  AIModelPicker,
  useAIChatInput,
  useAIChatValidation,
  useAutoScroll,
} from "@koloda/ai-react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import type { Deck } from "@koloda/srs";
import { useAtomValue } from "jotai";
import { useRef, useState } from "react";
import {
  assistantContextUsageAtom,
  assistantIsProcessingAtom,
  assistantMessagesAtom,
  assistantModeAtom,
} from "./assistant-conversation-atoms";
import { AssistantSettings } from "./assistant-settings";
import { useAssistantChat } from "./use-assistant-chat";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";

const aiChatPanel = [
  "flex flex-col gap-2 w-full max-w-3xl mx-auto p-2",
  "rounded-2xl border-2 border-input bg-input shadow-input",
].join(" ");

export type AssistantChatPanelProps = {
  deckId?: Deck["id"];
};

export function AssistantChatPanel({ deckId }: AssistantChatPanelProps) {
  const { ai } = useHotkeysSettings();
  const messages = useAtomValue(assistantMessagesAtom);
  const mode = useAtomValue(assistantModeAtom);
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const contextUsage = useAtomValue(assistantContextUsageAtom);
  const [areSettingsOpen, setAreSettingsOpen] = useState(false);
  const profilePickerRef = useRef<HTMLButtonElement>(null);
  const modelPickerRef = useRef<HTMLButtonElement>(null);
  const scroll = useAutoScroll({ messages, isLoading: isProcessing });
  const {
    profileId,
    modelId,
    modelName,
    provider,
    temperature,
    modelParameters,
    template,
    hasRequiredSecrets,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    generateError,
    contextLength,
    cardsPromptTemplate,
    chatPromptTemplate,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
    handleCardsPromptChange,
    handleChatPromptChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    setMode,
  } = useAssistantChat(deckId);

  const { inputValue, setInputValue, prompt, canSubmit, canCancel, submit, handleSubmit, handleNewConversation } =
    useAIChatInput({
      onSubmit: handleGenerate,
      onCancel: handleCancel,
      onReset: handleReset,
      isLoading: isProcessing,
      scroll,
    });

  const { showMissingSecretsWarning } = useAIChatValidation({
    profileId,
    modelId,
    prompt,
    isLoading: isProcessing,
    hasRequiredSecrets,
    isModelsLoading,
    isModelsError,
  });
  const renderMessage = useAssistantMessageRenderer({ template, deckId: deckId!, handleRetry });

  useAppHotkey(ai.cancel, () => handleCancel(), "", { enabled: canCancel, ignoreInputs: false });
  useAppHotkey(ai.openProfilePicker, () => profilePickerRef.current?.click(), "", { ignoreInputs: false });
  useAppHotkey(ai.newConversation, handleNewConversation, "", { ignoreInputs: false });
  useAppHotkey(ai.toggleCardsMode, () => setMode(mode === "chat" ? "cards" : "chat"), "", {
    enabled: !!deckId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openModelPicker, () => modelPickerRef.current?.click(), "", {
    enabled: !!profileId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.scrollUp, scroll.handleScrollUp, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollDown, scroll.handleScrollDown, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToTop, scroll.handleScrollToTop, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToBottom, scroll.handleScrollToBottom, "", { ignoreInputs: false });

  return (
    <section className="relative grow flex flex-col min-h-0 px-4">
      {areSettingsOpen
        ? (
          <div className="flex-1 min-h-0 overflow-auto -mx-4 px-4">
            <AssistantSettings
              template={template}
              provider={provider as AISecrets["provider"] | null}
              temperature={temperature}
              onTemperatureChange={handleTemperatureChange}
              cardsPromptTemplate={cardsPromptTemplate}
              chatPromptTemplate={chatPromptTemplate}
              onCardsPromptChange={handleCardsPromptChange}
              onChatPromptChange={handleChatPromptChange}
            />
          </div>
        )
        : (
          <>
            <AIChatMessages
              messages={messages}
              modelName={modelName}
              renderMessage={renderMessage}
              scroll={scroll}
            />
            <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingSecretFieldLabels} />
            <AIChatError error={generateError?.message} />
            <form className={`${aiChatPanel} shrink-0`} onSubmit={handleSubmit}>
              <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
              <div className="flex flex-row items-center min-w-0">
                <AIModelPicker
                  profileId={profileId}
                  value={modelId}
                  onChange={handleModelChange}
                  triggerRef={modelPickerRef}
                />
                {modelParameters.length > 0 && (
                  <AIModelParameters parameters={modelParameters} onChange={handleModelParameterChange} />
                )}
                <div className="grow min-w-3" />
                <div className="shrink-0 flex flex-row items-center gap-2">
                  <AIChatModeToggle
                    mode={mode}
                    deckId={deckId}
                    onModeChange={setMode}
                  />
                  <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={handleCancel} />
                </div>
              </div>
            </form>
          </>
        )}
      <AIChatFooter
        profileId={profileId}
        onProfileChange={handleProfileChange}
        triggerRef={profilePickerRef}
        contextUsage={contextUsage}
        contextLength={contextLength}
        settingsToggle={<AIChatSettingsToggle isOpen={areSettingsOpen} onOpenChange={setAreSettingsOpen} />}
      />
    </section>
  );
}
