import {
  AiChatContextUsage,
  AIChatError,
  AIChatFooter,
  AIChatMessages,
  AIChatMissingSecrets,
  AIChatModeToggle,
  AIChatPromptInput,
  AIChatPromptPanel,
  AIChatSettingsToggle,
  AIChatSubmit,
  AIModelParameters,
  AIModelPicker,
  AIProfilePicker,
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

export type AssistantChatProps = {
  deckId?: Deck["id"];
};

export function AssistantChat({ deckId }: AssistantChatProps) {
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
    modelParameters,
    template,
    hasRequiredSecrets,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    generateError,
    contextLength,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    setMode,
  } = useAssistantChat(deckId);

  const { inputValue, setInputValue, prompt, submit, handleSubmit, handleNewConversation } = useAIChatInput({
    onSubmit: handleGenerate,
    onCancel: handleCancel,
    onReset: handleReset,
    isLoading: isProcessing,
    scroll,
  });

  const { canSubmit, canCancel, showMissingSecretsWarning } = useAIChatValidation({
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
        ? <AssistantSettings template={template} provider={provider} />
        : (
          <>
            <AIChatMessages messages={messages} renderMessage={renderMessage} modelName={modelName} scroll={scroll} />
            <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingSecretFieldLabels} />
            <AIChatError error={generateError?.message} />
            <AIChatPromptPanel onSubmit={handleSubmit}>
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
                <div className="flex flex-row items-center gap-2 shrink-0">
                  <AIChatModeToggle
                    mode={mode}
                    deckId={deckId}
                    onModeChange={setMode}
                  />
                  <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={handleCancel} />
                </div>
              </div>
            </AIChatPromptPanel>
          </>
        )}
      <AIChatFooter>
        <AIProfilePicker value={profileId} onChange={handleProfileChange} triggerRef={profilePickerRef} />
        <div className="grow min-w-3" />
        {contextUsage !== undefined && contextLength !== undefined && (
          <AiChatContextUsage usage={contextUsage} contextLength={contextLength} />
        )}
        <AIChatSettingsToggle isOpen={areSettingsOpen} onOpenChange={() => setAreSettingsOpen((prev) => !prev)} />
      </AIChatFooter>
    </section>
  );
}
