import { getTextMessageContent } from "@koloda/ai";
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
import { Fade, QueryError } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import { useCallback, useRef, useState } from "react";
import {
  assistantContextUsageAtom,
  assistantConversationStateAtom,
  assistantDeckIdAtom,
  assistantEffectiveModeAtom,
  assistantErroredRunAtom,
  assistantIsProcessingAtom,
  assistantMessagesAtom,
  assistantRevertStateAtom,
  saveStatusAtom,
} from "./assistant-conversation-atoms";
import { getRunIdFromMessageId } from "./assistant-messages";
import { AssistantSettings } from "./assistant-settings";
import { resolveRunMode } from "./conversation-reducer";
import { RevertBanner } from "./revert-banner";
import { useAssistantChat } from "./use-assistant-chat";
import { useAssistantChatHotkeys } from "./use-assistant-chat-hotkeys";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";

export type AssistantChatProps = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
  deckPickerRef?: RefObject<HTMLButtonElement | null>;
  onClearDeck?: () => void;
  onPrevConversation?: () => void;
  onNextConversation?: () => void;
};

export function AssistantChat(
  { conversationId, onConversationIdChange, deckPickerRef, onClearDeck, onPrevConversation, onNextConversation }:
    AssistantChatProps,
) {
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
    retryLoad,
    setMode,
    readState,
  } = useAssistantChat({ conversationId, onConversationIdChange });

  const { inputValue, setInputValue, prompt, submit, handleSubmit, handleNewConversation } = useAIChatInput({
    onSubmit: handleGenerate,
    onCancel: handleCancel,
    onReset: handleReset,
    isLoading: isProcessing,
    scroll,
  });

  const setConversationReducerState = useSetAtom(assistantConversationStateAtom);

  const handleRevert = useCallback((userMessageId: string) => {
    const state = readState();
    const userMessage = state.messages.find((m) => m.id === userMessageId);
    if (!userMessage) return;
    const promptText = getTextMessageContent(userMessage);
    if (!promptText) return;

    // WHY: Revert is visual; the actual deletion happens on the next
    // prompt submit. We just set the in-memory revert state and update
    // the prompt input. Any active stream is canceled because its run
    // will be among the hidden messages and must not keep streaming.
    handleCancel();
    setConversationReducerState([
      "setRevertState",
      { revertedToUserMessageId: userMessageId, preRevertInputText: inputValue },
    ]);
    // WHY: Mirror the mode of the target message so the prompt input
    // lines up with what the run was sent in. Use setMode (bumps save)
    // rather than a raw setMode dispatch so the change persists.
    const runId = getRunIdFromMessageId(userMessageId);
    const targetMode = runId ? resolveRunMode(state, runId) : null;
    if (targetMode && targetMode !== state.mode) {
      setMode(targetMode);
    }
    setInputValue(promptText);
  }, [readState, handleCancel, setConversationReducerState, inputValue, setInputValue, setMode]);

  const handleRestore = useCallback(() => {
    const state = readState();
    if (!state.revertState) return;
    setInputValue(state.revertState.preRevertInputText);
    setConversationReducerState(["setRevertState", null]);
  }, [readState, setConversationReducerState, setInputValue]);

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
    profilePickerRef,
    modelPickerRef,
    deckPickerRef,
    onClearDeck,
    onPrevConversation,
    onNextConversation,
  });

  const generateErr = erroredRun?.error?.message ?? null;
  const saveErr = saveStatus.conversationId === conversationId && !saveStatus.isDismissed
    ? saveStatus.message
    : null;

  return (
    <section className="relative grow flex flex-col min-h-0 px-4">
      <AnimatePresence mode="wait">
        {isRestoring
          ? (
            <Fade key="restoring" className="grow flex items-center justify-center fg-level-2">
              {_(msg`ai.chat.restoring`)}
            </Fade>
          )
          : loadError
          ? (
            <Fade key="error" className="grow">
              <QueryError error={loadError} onRetry={retryLoad} />
            </Fade>
          )
          : areSettingsOpen
          ? (
            <Fade key="settings" className="grow flex flex-col">
              <AssistantSettings template={template} provider={provider} />
            </Fade>
          )
          : (
            <Fade key="chat" className="grow flex flex-col min-h-0">
              <AIChatMessages messages={messages} renderMessage={renderMessage} modelName={modelName} scroll={scroll} />
              <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingSecretFieldLabels} />
              {generateErr && <AIChatError error={generateErr} onDismiss={handleDismissGenerate} />}
              {saveErr && <AIChatError error={saveErr} onDismiss={handleDismissSave} />}
              {revertState && <RevertBanner onRestore={handleRestore} />}
              <AIChatPromptPanel onSubmit={handleSubmit}>
                <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
                <div className="flex flex-row items-center min-w-0 px-1 pb-2">
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
