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
import { QueryError } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import type { RefObject } from "react";
import { useRef, useState } from "react";
import {
  assistantContextUsageAtom,
  assistantConversationStateAtom,
  assistantDeckIdAtom,
  assistantErroredRunAtom,
  assistantIsLockedAtom,
  assistantIsProcessingAtom,
  assistantMessagesAtom,
  saveStatusAtom,
} from "./assistant-conversation-atoms";
import { AssistantSettings } from "./assistant-settings";
import { useAssistantChat } from "./use-assistant-chat";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";

export type AssistantChatProps = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
  deckPickerRef?: RefObject<HTMLButtonElement | null>;
  onClearDeck?: () => void;
};

export function AssistantChat({ conversationId, onConversationIdChange, deckPickerRef, onClearDeck }: AssistantChatProps) {
  const { _ } = useLingui();
  const { ai } = useHotkeysSettings();
  const messages = useAtomValue(assistantMessagesAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const isLocked = useAtomValue(assistantIsLockedAtom);
  const contextUsage = useAtomValue(assistantContextUsageAtom);
  const erroredRun = useAtomValue(assistantErroredRunAtom);
  const saveStatus = useAtomValue(saveStatusAtom);
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
    templateId,
    hasRequiredSecrets,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    contextLength,
    isRestoring,
    loadError,
    handleDismissGenerate,
    handleDismissSave,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    handleRetryLoad,
    setMode,
  } = useAssistantChat({ conversationId, onConversationIdChange });

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
  const effectiveMode = useAtomValue(assistantConversationStateAtom).mode === "cards" && deckId !== null
    ? "cards"
    : "chat";
  const renderMessage = useAssistantMessageRenderer({ templateId, handleRetry });

  useAppHotkey(ai.cancel, () => handleCancel(), "", { enabled: canCancel, ignoreInputs: false });
  useAppHotkey(ai.openProfilePicker, () => profilePickerRef.current?.click(), "", { ignoreInputs: false });
  useAppHotkey(ai.newConversation, handleNewConversation, "", { ignoreInputs: false });
  useAppHotkey(ai.toggleCardsMode, () => setMode(effectiveMode === "chat" ? "cards" : "chat"), "", {
    enabled: !!deckId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openModelPicker, () => modelPickerRef.current?.click(), "", {
    enabled: !!profileId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.openDeckPicker, () => deckPickerRef?.current?.click(), "", {
    enabled: !isLocked,
    ignoreInputs: false,
  });
  useAppHotkey(ai.clearDeck, () => onClearDeck?.(), "", {
    enabled: !isLocked && !!deckId,
    ignoreInputs: false,
  });
  useAppHotkey(ai.scrollUp, scroll.handleScrollUp, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollDown, scroll.handleScrollDown, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToTop, scroll.handleScrollToTop, "", { ignoreInputs: false });
  useAppHotkey(ai.scrollToBottom, scroll.handleScrollToBottom, "", { ignoreInputs: false });

  return (
    <section className="relative grow flex flex-col min-h-0 px-4">
      {isRestoring
        ? (
          <div className="flex grow items-center justify-center fg-level-2">
            {_(msg`ai.chat.restoring`)}
          </div>
        )
        : loadError
        ? <QueryError error={loadError} onRetry={handleRetryLoad} />
        : areSettingsOpen
        ? <AssistantSettings template={template} provider={provider} />
        : (
          <>
            <AIChatMessages messages={messages} renderMessage={renderMessage} modelName={modelName} scroll={scroll} />
            <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingSecretFieldLabels} />
            {(() => {
              const generateErr = erroredRun?.error?.message ?? null;
              const saveErr = saveStatus.conversationId === conversationId && !saveStatus.isDismissed
                ? saveStatus.message
                : null;
              return (
                <>
                  {generateErr && <AIChatError error={generateErr} onDismiss={handleDismissGenerate} />}
                  {saveErr && <AIChatError error={saveErr} onDismiss={handleDismissSave} />}
                </>
              );
            })()}
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
                  <AIChatModeToggle mode={effectiveMode} deckId={deckId ?? undefined} onModeChange={setMode} />
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
