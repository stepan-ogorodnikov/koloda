import { AiMagicIcon, Chat01Icon, Settings01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AIChat, AIProfilePicker } from "@koloda/react";
import { useAppHotkey, useHotkeysSettings, useHotkeysStatus } from "@koloda/react-base";
import { getGenerateErrorMessage } from "@koloda/srs";
import type { Deck, Template } from "@koloda/srs";
import { Button, Dialog, Fade, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { FocusScope } from "react-aria";
import { GenerateCardsSettings } from "./generate-cards-settings";
import { getChatTextMetadata } from "./generate-cards-utility";
import { GeneratedCardsMessage } from "./generated-cards-message";
import { useGenerateCardsDialog } from "./use-generate-cards-dialog";

export const closeConfirmOverlay = [
  "absolute inset-0 flex flex-col items-center justify-center gap-4",
  "bg-level-1/80 backdrop-blur-xs",
].join(" ");

export type GenerateCardsProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function GenerateCards({ deckId, templateId }: GenerateCardsProps) {
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
    handleGenerate,
    handleCancel,
    handleReset,
    getGeneratedCardsProps,
    hasContext,
    generationPromptTemplate,
    chatPromptTemplate,
    handleGenerationPromptChange,
    handleChatPromptChange,
  } = useGenerateCardsDialog(deckId, templateId);

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

  const renderMessage = useCallback((message: UIMessage, content: ReactNode) => {
    const props = getGeneratedCardsProps(message);
    if (props && props.template) return <GeneratedCardsMessage {...props} />;

    if (getChatTextMetadata(message)) return content;

    return content;
  }, [getGeneratedCardsProps]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleDialogOpenChange}>
      <div className="relative">
        <Button
          variants={{ style: "dashed", size: "icon" }}
          aria-label={_(msg`generate-cards.trigger`)}
          isDisabled={!hasProfiles}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={AiMagicIcon} aria-hidden="true" />
        </Button>
        {!hasProfiles && (
          <Tooltip content={_(msg`generate-cards.no-profiles`)} delay={0}>
            <Tooltip.HiddenTrigger />
          </Tooltip>
        )}
      </div>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "main" }}>
          <Dialog.Body>
            <Dialog.Header variants={{ class: "gap-4 py-0" }}>
              <Dialog.Title>{_(msg`generate-cards.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <Dialog.Content variants={{ class: "grow min-h-0 p-0 flex flex-col" }}>
              <div className="relative grow min-h-0 flex flex-col">
                <div className={selectedTab === "chat" ? "flex flex-col grow min-h-0" : "hidden"}>
                  <AIChat
                    showFooter={false}
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
                  />
                </div>
                {selectedTab === "settings" && (
                  <div className="grow overflow-auto">
                    <GenerateCardsSettings
                      template={template}
                      provider={provider}
                      temperature={temperature}
                      onTemperatureChange={handleTemperatureChange}
                      generationPromptTemplate={generationPromptTemplate}
                      chatPromptTemplate={chatPromptTemplate}
                      onGenerationPromptChange={handleGenerationPromptChange}
                      onChatPromptChange={handleChatPromptChange}
                    />
                  </div>
                )}
                <div className="self-center flex flex-row items-center w-full max-w-3xl my-2 px-2 shrink-0">
                  <AIProfilePicker value={profileId} onChange={handleProfileChange} />
                  <div className="grow min-w-3" />
                  <Button
                    variants={{ style: "ghost", size: "icon" }}
                    aria-label={_(msg`ai.chat.reset.label`)}
                    isDisabled={messages.length === 0 && !isGenerating}
                    onPress={handleReset}
                  >
                    <HugeiconsIcon
                      className="size-5 min-w-5"
                      strokeWidth={1.75}
                      icon={Undo02Icon}
                      aria-hidden="true"
                    />
                  </Button>
                  <Button
                    variants={{ style: "ghost", size: "icon" }}
                    aria-label={selectedTab === "chat" ? _(msg`generate-cards.settings.show-settings`) : _(msg`generate-cards.settings.show-chat`)}
                    onPress={() => setSelectedTab((prev) => prev === "chat" ? "settings" : "chat")}
                  >
                    <HugeiconsIcon
                      className="size-5 min-w-5"
                      strokeWidth={1.75}
                      icon={selectedTab === "chat" ? Settings01Icon : Chat01Icon}
                      aria-hidden="true"
                    />
                  </Button>
                </div>
                <AnimatePresence>
                  {isClosingRequested && (
                    <Fade className={closeConfirmOverlay} key="close-confirmation">
                      <FocusScope contain autoFocus>
                        <Button
                          variants={{ style: "ghost" }}
                          onClick={() => setIsClosingRequested(false)}
                        >
                          {_(msg`generate-cards.close.cancel`)}
                        </Button>
                        <Button
                          variants={{ style: "primary" }}
                          onClick={() => {
                            setIsClosingRequested(false);
                            handleOpenChange(false);
                          }}
                        >
                          {_(msg`generate-cards.close.confirm`)}
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
