import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AIChat } from "@koloda/ai-react";
import { useAppHotkey, useHotkeysSettings, useHotkeysStatus } from "@koloda/core-react";
import { getGenerateErrorMessage } from "@koloda/srs";
import type { Deck, Template } from "@koloda/srs";
import { Button, Dialog, Fade, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { FocusScope } from "react-aria";
import { AIChatSettings } from "./ai-chat-settings";
import { useAIChatDialog } from "./use-ai-chat-dialog";
import { useAIChatMessageRenderer } from "./use-ai-chat-message-renderer";

export const closeConfirmOverlay = [
  "absolute inset-0 z-20 flex flex-col items-center justify-center gap-4",
  "bg-level-1/80 backdrop-blur-xs",
].join(" ");

export type AIChatDialogProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function AIChatDialog({ deckId, templateId }: AIChatDialogProps) {
  const { _ } = useLingui();
  const { ai } = useHotkeysSettings();
  const { disableScope, enableScope } = useHotkeysStatus();
  const [selectedTab, setSelectedTab] = useState<"chat" | "settings">("chat");
  const [isClosingRequested, setIsClosingRequested] = useState(false);
  const {
    isOpen,
    profileId,
    modelId,
    modelName,
    provider,
    temperature,
    modelParameters,
    messages,
    template,
    hasProfiles,
    isGenerating,
    generateError,
    mode,
    setMode,
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    getGeneratedCardsProps,
    getChatMessageProps,
    hasContext,
    contextUsage,
    contextLength,
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  } = useAIChatDialog(deckId, templateId);

  useEffect(() => {
    (isOpen ? disableScope : enableScope)("nav");
  }, [isOpen, disableScope, enableScope]);

  useAppHotkey(
    ai.toggleSettings,
    () => setSelectedTab((prev) => prev === "chat" ? "settings" : "chat"),
    "",
    { enabled: isOpen, ignoreInputs: false },
  );

  const handleDialogOpenChange = useCallback((value: boolean) => {
    if (!value && hasContext) {
      setIsClosingRequested(true);
      return;
    }
    if (value) setSelectedTab("chat");
    handleOpenChange(value);
  }, [hasContext, handleOpenChange]);

  const renderMessage = useAIChatMessageRenderer({
    getGeneratedCardsProps,
    getChatMessageProps,
  });

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleDialogOpenChange}>
      <div className="relative">
        <Button
          variants={{ style: "dashed", size: "icon" }}
          aria-label={_(msg`ai-chat.trigger`)}
          isDisabled={!hasProfiles}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={AiMagicIcon} aria-hidden="true" />
        </Button>
        {!hasProfiles && (
          <Tooltip content={_(msg`ai-chat.no-profiles`)} delay={0}>
            <Tooltip.Trigger variants={{ isHidden: true, isDisabled: true }} />
          </Tooltip>
        )}
      </div>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "main" }}>
          <Dialog.Body>
            <Dialog.Header variants={{ class: "gap-4 py-0" }}>
              <Dialog.Title>{_(msg`ai-chat.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <Dialog.Content variants={{ class: "grow min-h-0 p-0 flex flex-col" }}>
              <div className="relative grow min-h-0 flex flex-col">
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
                  error={getGenerateErrorMessage(generateError, _)}
                  emptyState={null}
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
                      provider={provider}
                      temperature={temperature}
                      onTemperatureChange={handleTemperatureChange}
                      cardsPromptTemplate={cardsPromptTemplate}
                      chatPromptTemplate={chatPromptTemplate}
                      onCardsPromptChange={handleCardsPromptChange}
                      onChatPromptChange={handleChatPromptChange}
                    />
                  }
                  settingsPanelOpen={selectedTab === "settings"}
                  onSettingsPanelOpenChange={(open) => setSelectedTab(open ? "settings" : "chat")}
                />
                <AnimatePresence>
                  {isClosingRequested && (
                    <Fade className={closeConfirmOverlay} key="close-confirmation">
                      <FocusScope contain autoFocus>
                        <Button
                          variants={{ style: "ghost" }}
                          onClick={() => setIsClosingRequested(false)}
                        >
                          {_(msg`ai-chat.close.cancel`)}
                        </Button>
                        <Button
                          variants={{ style: "primary" }}
                          onClick={() => {
                            setIsClosingRequested(false);
                            handleOpenChange(false);
                          }}
                        >
                          {_(msg`ai-chat.close.confirm`)}
                        </Button>
                      </FocusScope>
                    </Fade>
                  )}
                </AnimatePresence>
              </div>
            </Dialog.Content>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
