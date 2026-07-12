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
  AIModelProfilePicker,
  useAIChatInput,
  useAIChatValidation,
  useAutoScroll,
} from "@koloda/ai-react";
import { Fade, QueryError } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import { useCallback, useRef, useState } from "react";
import {
  assistantContextUsageAtom,
  assistantDeckIdAtom,
  assistantEffectiveModeAtom,
  assistantErroredRunAtom,
  assistantIsProcessingAtom,
  assistantMessagesAtom,
  assistantRevertStateAtom,
  saveStatusAtom,
} from "./assistant-conversation-atoms";
import { AssistantSettings } from "./assistant-settings";
import { RevertBanner } from "./revert-banner";
import { useAssistantChatHotkeys } from "./use-assistant-chat-hotkeys";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";
import { useAssistantProfileSelection } from "./use-assistant-profile-selection";
import { useAssistantSession } from "./use-assistant-session";
import { useConversationPersistence } from "./use-conversation-persistence";

export type AssistantChatProps = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
  deckPickerRef?: RefObject<HTMLButtonElement | null>;
  onClearDeck?: () => void;
  onPrevConversation?: () => void;
  onNextConversation?: () => void;
};

export function AssistantChat({
  conversationId,
  onConversationIdChange,
  deckPickerRef,
  onClearDeck,
  onPrevConversation,
  onNextConversation,
}: AssistantChatProps) {
  const { _ } = useLingui();
  const messages = useAtomValue(assistantMessagesAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const contextUsage = useAtomValue(assistantContextUsageAtom);
  const erroredRun = useAtomValue(assistantErroredRunAtom);
  const saveStatus = useAtomValue(saveStatusAtom);
  const revertState = useAtomValue(assistantRevertStateAtom);
  const effectiveMode = useAtomValue(assistantEffectiveModeAtom);
  const [areSettingsOpen, setAreSettingsOpen] = useState(false);
  const modelProfilePickerRef = useRef<HTMLButtonElement>(null);
  const scroll = useAutoScroll({ messages, isLoading: isProcessing });

  const {
    profileId,
    modelId,
    modelName,
    models,
    profiles,
    provider,
    modelParameters,
    selectedProfile,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    areProfilesLoading,
    setGlobalAIProfileState,
    handleModelProfileChange,
    handleModelParameterChange,
  } = useAssistantProfileSelection();
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;
  const contextLength = models.find((m) => m.id === modelId)?.context_length ?? 0;

  const { isRestoring, loadError, handleDismissSave, retryLoad } = useConversationPersistence({ conversationId });

  const {
    template,
    templateId,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    handleRevert: revertToMessage,
    handleRestore: restoreFromRevert,
    handleDismissGenerate,
    setMode,
  } = useAssistantSession({
    conversationId,
    onConversationIdChange,
    profileId,
    modelId,
    modelName,
    modelParameters,
    selectedProfile,
    setGlobalAIProfileState,
  });

  const { inputValue, setInputValue, prompt, submit, handleSubmit, handleNewConversation } = useAIChatInput({
    onSubmit: handleGenerate,
    onCancel: handleCancel,
    onReset: handleReset,
    isLoading: isProcessing,
    scroll,
  });

  const handleRevert = useCallback(
    (userMessageId: string) => {
      const promptText = revertToMessage(userMessageId, inputValue);
      if (promptText != null) setInputValue(promptText);
    },
    [revertToMessage, inputValue, setInputValue],
  );

  const handleRestore = useCallback(() => {
    const text = restoreFromRevert();
    if (text != null) setInputValue(text);
  }, [restoreFromRevert, setInputValue]);

  const { canSubmit, canCancel, showMissingSecretsWarning } = useAIChatValidation({
    profileId,
    modelId,
    prompt,
    isLoading: isProcessing,
    hasRequiredSecrets,
    isModelsLoading,
    isModelsError,
  });

  const renderMessage = useAssistantMessageRenderer({ templateId, handleRetry, handleRevert });

  useAssistantChatHotkeys({
    handleCancel,
    handleNewConversation,
    scroll,
    modelProfilePickerRef,
    deckPickerRef,
    onClearDeck,
    onPrevConversation,
    onNextConversation,
  });

  const generateErr = erroredRun?.error?.message ?? null;
  const saveErr = saveStatus.conversationId === conversationId && !saveStatus.isDismissed ? saveStatus.message : null;

  return (
    <section className="relative grow flex flex-col min-h-0 px-4">
      <AnimatePresence mode="wait">
        {isRestoring ? (
          <Fade key="restoring" className="grow flex items-center justify-center fg-level-2">
            {_(msg`ai.chat.restoring`)}
          </Fade>
        ) : loadError ? (
          <Fade key="error" className="grow">
            <QueryError error={loadError} onRetry={retryLoad} />
          </Fade>
        ) : areSettingsOpen ? (
          <Fade key="settings" className="grow flex flex-col">
            <AssistantSettings template={template} provider={provider} />
          </Fade>
        ) : (
          <Fade key="chat" className="grow flex flex-col min-h-0">
            <AIChatMessages messages={messages} renderMessage={renderMessage} modelName={modelName} scroll={scroll} />
            <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingSecretFieldLabels} />
            {generateErr && <AIChatError error={generateErr} onDismiss={handleDismissGenerate} />}
            {saveErr && <AIChatError error={saveErr} onDismiss={handleDismissSave} />}
            {revertState && <RevertBanner onRestore={handleRestore} />}
            <AIChatPromptPanel onSubmit={handleSubmit}>
              <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
              <div className="flex flex-row items-center min-w-0 px-1 pb-2">
                <div className="grow min-w-3" />
                <div className="flex flex-row items-center gap-2 shrink-0 px-1">
                  <AIChatModeToggle mode={effectiveMode} deckId={deckId ?? undefined} onModeChange={setMode} />
                  <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={handleCancel} />
                </div>
              </div>
            </AIChatPromptPanel>
          </Fade>
        )}
      </AnimatePresence>
      <AIChatFooter>
        <AIModelProfilePicker
          profiles={profiles}
          areProfilesLoading={areProfilesLoading}
          profileId={profileId}
          modelId={modelId}
          onChange={handleModelProfileChange}
          triggerRef={modelProfilePickerRef}
        />
        {modelParameters.length > 0 && (
          <AIModelParameters parameters={modelParameters} onChange={handleModelParameterChange} />
        )}
        <div className="grow min-w-3" />
        {contextUsage !== undefined && contextLength !== undefined && (
          <AiChatContextUsage usage={contextUsage} contextLength={contextLength} />
        )}
        <AIChatSettingsToggle isOpen={areSettingsOpen} onOpenChange={() => setAreSettingsOpen((prev) => !prev)} />
      </AIChatFooter>
    </section>
  );
}
