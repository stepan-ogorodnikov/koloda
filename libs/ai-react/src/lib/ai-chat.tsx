import { ArrowDown02Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ModelParameter, StreamUsage } from "@koloda/ai";
import { useHotkeysSettings } from "@koloda/core-react";
import { useAppHotkey } from "@koloda/core-react";
import { Button, ClipboardIcon, Fade, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { AnimatePresence } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { AIChatError } from "./ai-chat-error";
import { AIChatFooter } from "./ai-chat-footer";
import { AIChatMessage } from "./ai-chat-message";
import { AIChatPromptInput } from "./ai-chat-prompt-input";
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
            <div className="relative flex-1 min-h-0 -mx-4 px-4">
              <div
                className="absolute inset-0 flex flex-col items-center overflow-y-auto no-focus-ring [scrollbar-gutter:stable_both-edges]"
                ref={scroll.scrollViewportRef}
                onScroll={scroll.handleScroll}
                tabIndex={0}
              >
                <div
                  className="flex flex-col gap-4 min-h-full w-full max-w-3xl py-2"
                  aria-label={_(msg`ai.chat.messages.label`)}
                  aria-live="polite"
                  role="log"
                  ref={scroll.messagesRef}
                >
                  {messages.length === 0
                    ? emptyState
                    : (
                      <>
                        {messages.map((message) => {
                          const content = (
                            <AIChatMessage
                              role={message.role}
                              modelName={modelName}
                              parts={message.parts}
                              key={message.id}
                            />
                          );
                          return (
                            <Fragment key={message.id}>
                              {renderMessage ? renderMessage(message, content) : content}
                            </Fragment>
                          );
                        })}
                      </>
                    )}
                </div>
              </div>
              <AnimatePresence>
                {scroll.showJumpToLatest && (
                  <Fade className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center w-full max-w-3xl">
                    <Tooltip content={_(msg`ai.chat.scroll-to-latest.label`)}>
                      <Button
                        variants={{ style: "primary", size: "icon", class: "rounded-full" }}
                        aria-label={_(msg`ai.chat.scroll-to-latest.label`)}
                        onPress={scroll.handleScrollToLatest}
                      >
                        <HugeiconsIcon
                          className="size-5 min-w-5"
                          strokeWidth={1.75}
                          icon={ArrowDown02Icon}
                          aria-hidden="true"
                        />
                      </Button>
                    </Tooltip>
                  </Fade>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {showMissingSecretsWarning && (
                <Fade className="self-center w-full max-w-3xl mb-2 px-4 py-2 rounded-xl border-2 border-main bg-level-1 flex flex-col gap-1">
                  <em className="fg-error not-italic">
                    {_(msg`ai.chat.profile-data-missing`)}: {missingLabels}
                  </em>
                  <span className="fg-level-2 text-sm/6">
                    {_(msg`ai.chat.profile-data-missing.hint`)}
                  </span>
                </Fade>
              )}
            </AnimatePresence>
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
                    <Tooltip content={cardsModeTooltip}>
                      <Button
                        variants={{
                          style: "bordered",
                          size: "icon",
                          class:
                            "rounded-xl border-transparent data-is-active:border-fg-link data-is-active:bg-button-pressed data-is-active:fg-link",
                        }}
                        aria-label={_(msg`ai.chat.mode.cards.on`)}
                        aria-pressed={mode === "cards"}
                        data-is-active={mode === "cards" || undefined}
                        isDisabled={!deckId}
                        onPress={() => onModeChange(mode === "chat" ? "cards" : "chat")}
                      >
                        <HugeiconsIcon
                          className="size-6 min-w-6"
                          strokeWidth={1.5}
                          icon={ClipboardIcon}
                          aria-hidden="true"
                        />
                      </Button>
                    </Tooltip>
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
            <Tooltip content={_(msg`ai.chat.settings.toggle`)}>
              <Button
                variants={{
                  style: "ghost",
                  size: "icon",
                  class: "data-is-active:bg-button-pressed data-is-active:fg-level-1",
                }}
                aria-label={_(msg`ai.chat.settings.toggle`)}
                aria-pressed={settingsPanelOpen}
                data-is-active={settingsPanelOpen || undefined}
                onPress={() => onSettingsPanelOpenChange?.(!settingsPanelOpen)}
              >
                <HugeiconsIcon
                  className="size-5 min-w-5"
                  strokeWidth={1.75}
                  icon={Settings01Icon}
                  aria-hidden="true"
                />
              </Button>
            </Tooltip>
          )
          : undefined}
      />
    </section>
  );
}
