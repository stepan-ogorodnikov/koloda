import { AiMagicIcon, Chat01Icon, Settings05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AIChat } from "@koloda/react";
import { useHotkeysStatus } from "@koloda/react-base";
import type { Deck, Template } from "@koloda/srs";
import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { GenerateCardsPromptSettings } from "./generate-cards-prompt-settings";
import { GeneratedCardsMessage } from "./generated-cards-message";
import { useGenerateCardsDialog } from "./use-generate-cards-dialog";

export type GenerateCardsProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function GenerateCards({ deckId, templateId }: GenerateCardsProps) {
  const { _ } = useLingui();
  const { disableScope, enableScope } = useHotkeysStatus();
  const [areSettingsOpen, setAreSettingsOpen] = useState(false);
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
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleGenerate,
    handleCancel,
    getGeneratedCardsProps,
  } = useGenerateCardsDialog(deckId, templateId);

  useEffect(() => {
    (isOpen ? disableScope : enableScope)("nav");
  }, [isOpen, disableScope, enableScope]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) setAreSettingsOpen(false);
    handleOpenChange(open);
  }, [handleOpenChange]);

  const renderMessage = useCallback((message: UIMessage, content: ReactNode) => {
    const props = getGeneratedCardsProps(message);
    if (!props || !props.template) return content;

    return <GeneratedCardsMessage {...props} />;
  }, [getGeneratedCardsProps]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleDialogOpenChange}>
      <Button
        variants={{ style: "dashed", size: "icon", class: "max-tb:hidden" }}
        aria-label={_(msg`generate-cards.trigger`)}
        isDisabled={!hasProfiles}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={AiMagicIcon} aria-hidden="true" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "main" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`generate-cards.title`)}</Dialog.Title>
              <div className="grow" />
              <div className="flex flex-row gap-2">
                <Button
                  variants={{ style: "ghost", size: "none", class: "size-8" }}
                  aria-label={areSettingsOpen
                    ? _(msg`generate-cards.settings.show-chat`)
                    : _(msg`generate-cards.settings.show-settings`)}
                  onPress={() => setAreSettingsOpen((prev) => !prev)}
                >
                  {areSettingsOpen
                    ? (
                      <HugeiconsIcon
                        className="size-5 min-w-5"
                        strokeWidth={1.75}
                        icon={Chat01Icon}
                        aria-hidden="true"
                      />
                    )
                    : (
                      <HugeiconsIcon
                        className="size-5 min-w-5"
                        strokeWidth={1.75}
                        icon={Settings05Icon}
                        aria-hidden="true"
                      />
                    )}
                </Button>
                <Dialog.Close slot="close" />
              </div>
            </Dialog.Header>
            <Dialog.Content variants={{ class: "grow min-h-0 py-0" }}>
              <AnimatePresence mode="wait">
                {areSettingsOpen
                  ? (
                    <Fade className="overflow-auto" key="settings">
                      <GenerateCardsPromptSettings
                        template={template}
                        provider={provider}
                        temperature={temperature}
                        onTemperatureChange={handleTemperatureChange}
                      />
                    </Fade>
                  )
                  : (
                    <Fade className="flex h-full min-h-0 flex-col" key="chat">
                      <AIChat
                        profileId={profileId}
                        modelId={modelId}
                        modelName={modelName}
                        messages={messages}
                        onProfileChange={handleProfileChange}
                        onModelChange={handleModelChange}
                        onSubmit={handleGenerate}
                        onCancel={handleCancel}
                        isLoading={isGenerating}
                        error={generateError?.message}
                        renderMessage={renderMessage}
                      />
                    </Fade>
                  )}
              </AnimatePresence>
            </Dialog.Content>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
