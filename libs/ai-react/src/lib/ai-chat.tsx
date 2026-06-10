import type { ModelParameter, StreamUsage } from "@koloda/ai";
import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AIChatError } from "./ai-chat-error";
import { AIChatFooter } from "./ai-chat-footer";
import { AIChatMessages } from "./ai-chat-messages";
import { AIChatMissingSecrets } from "./ai-chat-missing-secrets";
import { AIChatModeToggle } from "./ai-chat-mode-toggle";
import { AIChatPromptInput } from "./ai-chat-prompt-input";
import { AIChatSettingsToggle } from "./ai-chat-settings-toggle";
import { AIChatSubmit } from "./ai-chat-submit";
import { AIModelParameters } from "./ai-model-parameters";
import { AIModelPicker } from "./ai-model-picker";
import type { AIChatMode } from "./types";
import { useAIProfiles } from "./use-ai-profiles";
import { useAutoScroll } from "./use-auto-scroll";

const aiChatPanel = [
  "flex flex-col gap-2 w-full max-w-3xl mx-auto p-2",
  "rounded-2xl border-2 border-input bg-input shadow-input",
].join(" ");

export type AIChatProps = {
  messages: UIMessage[];
  profileId: string;
  modelId: string;
  modelName?: string;
  deckId?: number;
  onProfileChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel?: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  isModelsLoading?: boolean;
  isModelsError?: boolean;
  error?: string | null;
  autoSelectDefaultProfile?: boolean;
  emptyState?: ReactNode;
  renderMessage?: (message: UIMessage, content: ReactNode) => ReactNode;
  mode?: AIChatMode;
  onModeChange?: (mode: AIChatMode) => void;
  modelParameters?: ModelParameter[];
  onModelParameterChange?: (type: ModelParameter["type"], value: string) => void;
  contextUsage?: StreamUsage | null;
  contextLength?: number;
  settingsPanel?: ReactNode;
  settingsPanelOpen?: boolean;
  onSettingsPanelOpenChange?: (open: boolean) => void;
};

export function AIChat({
  messages,
  profileId,
  modelId,
  modelName,
  deckId,
  onProfileChange,
  onModelChange,
  onSubmit,
  onCancel,
  onReset,
  isLoading = false,
  isModelsLoading = false,
  isModelsError = false,
  error,
  autoSelectDefaultProfile = true,
  emptyState = null,
  renderMessage,
  mode,
  onModeChange,
  modelParameters,
  onModelParameterChange,
  contextUsage,
  contextLength,
  settingsPanel,
  settingsPanelOpen,
  onSettingsPanelOpenChange,
}: AIChatProps) {
  const { _ } = useLingui();
  const { ai } = useHotkeysSettings();
  const { defaultProfileId, missingSecretFieldLabels } = useAIProfiles(profileId);
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;
  const [inputValue, setInputValue] = useState("");
  const profilePickerRef = useRef<HTMLButtonElement>(null);
  const modelPickerRef = useRef<HTMLButtonElement>(null);
  const prompt = inputValue.trim();
  const scroll = useAutoScroll({ messages, isLoading });

  useEffect(() => {
    if (autoSelectDefaultProfile && defaultProfileId && !profileId) {
      onProfileChange(defaultProfileId);
    }
  }, [autoSelectDefaultProfile, defaultProfileId, profileId, onProfileChange]);

  const submit = () => {
    if (
      profileId && modelId && prompt && !isLoading && hasRequiredSecrets
      && !isModelsLoading && !isModelsError
    ) {
      const shouldFollow = scroll.prepareSubmit();
      onSubmit(prompt);
      setInputValue("");
      if (shouldFollow) scroll.startFollowingLatest("smooth");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleNewConversation = () => {
    setInputValue("");
    scroll.resetScroll();
    onReset?.();
  };

  const canSubmit = !!(
    profileId && modelId && !!prompt && !isLoading && hasRequiredSecrets
    && !isModelsLoading && !isModelsError
  );
  const canCancel = isLoading && !!onCancel;
  const showMissingSecretsWarning = !!profileId && !hasRequiredSecrets;
  const missingLabels = missingSecretFieldLabels.join(", ");
  const hasSettingsToggle = !!settingsPanel && onSettingsPanelOpenChange;

  useAppHotkey(ai.cancel, () => onCancel?.(), "", { enabled: canCancel, ignoreInputs: false });
  useAppHotkey(ai.openProfilePicker, () => profilePickerRef.current?.click(), "", { ignoreInputs: false });
  useAppHotkey(ai.newConversation, handleNewConversation, "", { ignoreInputs: false });
  useAppHotkey(ai.toggleCardsMode, () => onModeChange?.(mode === "chat" ? "cards" : "chat"), "", {
    enabled: !!onModeChange,
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

  const cardsModeTooltip = deckId
    ? (mode === "cards" ? _(msg`ai.chat.mode.cards.on`) : _(msg`ai.chat.mode.cards.off`))
    : _(msg`ai.chat.mode.cards.no-deck`);

  return (
    <section className="relative grow flex flex-col min-h-0 px-4">
      {settingsPanelOpen
        ? (
          <div className="flex-1 min-h-0 overflow-auto -mx-4 px-4">
            {settingsPanel}
          </div>
        )
        : (
          <>
            <AIChatMessages
              messages={messages}
              modelName={modelName}
              emptyState={emptyState}
              renderMessage={renderMessage}
              scroll={scroll}
            />
            <AIChatMissingSecrets show={showMissingSecretsWarning} missingLabels={missingLabels} />
            <AIChatError error={error} />
            <form className={`${aiChatPanel} shrink-0`} onSubmit={handleSubmit}>
              <AIChatPromptInput value={inputValue} onChange={setInputValue} onSubmit={submit} />
              <div className="flex flex-row items-center min-w-0">
                <AIModelPicker
                  profileId={profileId}
                  value={modelId}
                  onChange={onModelChange}
                  triggerRef={modelPickerRef}
                />
                {modelParameters && onModelParameterChange && (
                  <AIModelParameters parameters={modelParameters} onChange={onModelParameterChange} />
                )}
                <div className="grow min-w-3" />
                <div className="shrink-0 flex flex-row items-center gap-2">
                  {onModeChange && (
                    <AIChatModeToggle
                      mode={mode}
                      deckId={deckId}
                      onModeChange={onModeChange}
                      tooltip={cardsModeTooltip}
                    />
                  )}
                  <AIChatSubmit canSubmit={canSubmit} canCancel={canCancel} onCancel={onCancel} />
                </div>
              </div>
            </form>
          </>
        )}
      <AIChatFooter
        profileId={profileId}
        onProfileChange={onProfileChange}
        triggerRef={profilePickerRef}
        contextUsage={contextUsage}
        contextLength={contextLength}
        settingsToggle={hasSettingsToggle
          ? (
            <AIChatSettingsToggle
              isOpen={settingsPanelOpen}
              onOpenChange={onSettingsPanelOpenChange}
            />
          )
          : undefined}
      />
    </section>
  );
}
