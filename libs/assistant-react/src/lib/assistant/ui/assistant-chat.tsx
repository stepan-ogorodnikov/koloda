import {
  AiChatContextUsage,
  AIChatError,
  AIChatFooter,
  AIChatMessages,
  AIChatMissingSecrets,
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
import { formatGenerateError } from "@koloda/ai/app-error";
import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { Fade, QueryError } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { AssistantConversationRecovery } from "./assistant-conversation-recovery";
import { renderAssistantMarkdown } from "./assistant-markdown";
import { AssistantNoProfiles } from "./assistant-no-profiles";
import { AssistantSettings } from "./assistant-settings";
import { setAssistantPromptInputAtom } from "../state/conversation-actions";
import {
  assistantContextUsageAtom,
  assistantErroredRunAtom,
  assistantIsProcessingAtom,
  assistantMessagesAtom,
  assistantPromptInputAtom,
  assistantRevertStateAtom,
} from "../state/conversation-selectors";
import { saveStatusAtom } from "../state/conversation-store";
import { RevertBanner } from "./revert-banner";
import { useAssistantChatHotkeys } from "./use-assistant-chat-hotkeys";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";
import { useAssistantProfileSelection } from "../use-assistant-profile-selection";
import { useAssistantSession } from "../runs/use-assistant-session";
import { useConversationPersistence } from "../persistence/use-conversation-persistence";

export type RenderAddProfileDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export type AssistantChatProps = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
  onStartNewConversation: () => void;
  /** Called when the active conversation is deleted so the route can navigate away. */
  onActiveDeleted?: () => void;
  onPrevConversation?: () => void;
  onNextConversation?: () => void;
  renderAddProfileDialog?: (props: RenderAddProfileDialogProps) => ReactNode;
};

export function AssistantChat({
  conversationId,
  onConversationIdChange,
  onStartNewConversation,
  onActiveDeleted,
  onPrevConversation,
  onNextConversation,
  renderAddProfileDialog,
}: AssistantChatProps) {
  const { _ } = useLingui();
  const messages = useAtomValue(assistantMessagesAtom);
  const promptInput = useAtomValue(assistantPromptInputAtom);
  const applyPromptInput = useSetAtom(setAssistantPromptInputAtom);
  const setPromptInput = useCallback(
    (text: string) => {
      const mintedId = applyPromptInput(text);
      if (mintedId) onConversationIdChange(mintedId);
    },
    [applyPromptInput, onConversationIdChange],
  );
  const isProcessing = useAtomValue(assistantIsProcessingAtom);
  const contextUsage = useAtomValue(assistantContextUsageAtom);
  const erroredRun = useAtomValue(assistantErroredRunAtom);
  const saveStatus = useAtomValue(saveStatusAtom);
  const revertState = useAtomValue(assistantRevertStateAtom);
  const [areSettingsOpen, setAreSettingsOpen] = useState(false);
  const [isAddProfileOpen, setIsAddProfileOpen] = useState(false);
  const modelProfilePickerRef = useRef<HTMLButtonElement>(null);
  const scroll = useAutoScroll({ messages, isLoading: isProcessing });

  const openAddProfile = useCallback(() => setIsAddProfileOpen(true), []);

  const {
    profileId,
    modelId,
    modelName,
    models,
    profiles,
    modelParameters,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    areProfilesLoading,
    handleModelProfileChange,
    handleModelParameterChange,
  } = useAssistantProfileSelection();
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;
  const contextLength = models.find((m) => m.id === modelId)?.context_length ?? 0;

  const { isRestoring, loadError, handleDismissSave, retrySave, retryLoad, blockedRestore } =
    useConversationPersistence({ conversationId });

  const { controller } = useAssistantSession({
    conversationId,
    onConversationIdChange,
    onStartNewConversation,
    profileId,
    modelId,
    modelName,
    modelParameters,
  });

  const { inputValue, setInputValue, prompt, submit, handleSubmit, handleNewConversation } = useAIChatInput({
    value: promptInput,
    onChange: setPromptInput,
    onSubmit: controller.submit,
    onReset: controller.reset,
    isLoading: isProcessing,
    scroll,
  });

  // WHY: Revert/restore return prompt text the input must adopt; that glue
  // stays in the chat shell, not on RunController.
  const handleRevert = useCallback(
    (userMessageId: string) => {
      const promptText = controller.revert(userMessageId, inputValue);
      if (promptText != null) setInputValue(promptText);
    },
    [controller, inputValue, setInputValue],
  );

  const handleRestore = useCallback(() => {
    const text = controller.restore();
    if (text != null) setInputValue(text);
  }, [controller, setInputValue]);

  const { canSubmit, canCancel, showMissingSecretsWarning } = useAIChatValidation({
    profileId,
    modelId,
    prompt,
    isLoading: isProcessing,
    hasRequiredSecrets,
    isModelsLoading,
    isModelsError,
  });

  const renderMessage = useAssistantMessageRenderer({
    handleRetry: controller.retry,
    handleRevert,
  });

  useAssistantChatHotkeys({
    handleCancel: controller.cancel,
    handleNewConversation,
    scroll,
    modelProfilePickerRef,
    onPrevConversation,
    onNextConversation,
  });

  const generateErr = formatGenerateError(erroredRun?.error, _);
  const saveErr =
    saveStatus.conversationId === conversationId && !saveStatus.isDismissed && saveStatus.error
      ? formatAppError(saveStatus.error, _, ERROR_MESSAGES["db.update"])
      : null;
  const hasNoProfiles = !areProfilesLoading && profiles.length === 0;
  const showNoProfilesEmpty = hasNoProfiles && renderAddProfileDialog != null;
  const emptyState = showNoProfilesEmpty ? <AssistantNoProfiles onAddProfile={openAddProfile} /> : null;

  return (
    <section className="relative grow flex flex-col min-h-0 px-4">
      {hasNoProfiles &&
        renderAddProfileDialog?.({
          isOpen: isAddProfileOpen,
          onOpenChange: setIsAddProfileOpen,
        })}
      <AnimatePresence mode="wait">
        {isRestoring ? (
          <Fade key="restoring" className="grow flex items-center justify-center fg-level-2">
            {_(msg`ai.chat.restoring`)}
          </Fade>
        ) : loadError ? (
          <Fade key="error" className="grow">
            <QueryError error={loadError} onRetry={retryLoad} />
          </Fade>
        ) : conversationId && blockedRestore ? (
          <Fade key="recovery" className="grow">
            <AssistantConversationRecovery
              conversationId={conversationId}
              blocked={blockedRestore}
              onDeleted={onActiveDeleted}
            />
          </Fade>
        ) : (
          <Fade key="chat" className="grow flex flex-col min-h-0">
            <AIChatMessages
              messages={messages}
              renderMessage={renderMessage}
              renderText={renderAssistantMarkdown}
              modelName={modelName}
              emptyState={emptyState}
              scroll={scroll}
            />
            <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingSecretFieldLabels} />
            {generateErr && <AIChatError {...generateErr} onDismiss={controller.dismissGenerate} />}
            {saveErr && <AIChatError {...saveErr} onDismiss={handleDismissSave} onRetry={retrySave} />}
            {revertState && <RevertBanner onRestore={handleRestore} />}
            <AIChatPromptPanel onSubmit={handleSubmit}>
              <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
              <div className="flex flex-row items-center min-w-0 px-1 pb-2">
                <div className="grow min-w-3" />
                <div className="flex flex-row items-center gap-2 shrink-0 px-1">
                  <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={controller.cancel} />
                </div>
              </div>
            </AIChatPromptPanel>
          </Fade>
        )}
      </AnimatePresence>
      <AssistantSettings isOpen={areSettingsOpen} onOpenChange={setAreSettingsOpen} />
      <AIChatFooter>
        <AIModelProfilePicker
          profiles={profiles}
          areProfilesLoading={areProfilesLoading}
          profileId={profileId}
          modelId={modelId}
          onChange={handleModelProfileChange}
          triggerRef={modelProfilePickerRef}
          onAddProfile={hasNoProfiles ? openAddProfile : undefined}
        />
        {modelParameters.length > 0 && (
          <AIModelParameters parameters={modelParameters} onChange={handleModelParameterChange} />
        )}
        <div className="grow min-w-3" />
        {contextUsage != null && <AiChatContextUsage usage={contextUsage} contextLength={contextLength} />}
        <AIChatSettingsToggle isOpen={areSettingsOpen} onOpenChange={() => setAreSettingsOpen((prev) => !prev)} />
      </AIChatFooter>
    </section>
  );
}
