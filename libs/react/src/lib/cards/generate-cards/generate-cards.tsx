import { AiMagicIcon, Chat01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AIChat } from "@koloda/react";
import { useHotkeysStatus } from "@koloda/react-base";
import { getGenerateErrorMessage } from "@koloda/srs";
import type { Deck, Template } from "@koloda/srs";
import { Button, Dialog, Tabs, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
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
  const [selectedTab, setSelectedTab] = useState<"chat" | "settings">("chat");
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
    handleReset,
    getGeneratedCardsProps,
  } = useGenerateCardsDialog(deckId, templateId);

  useEffect(() => {
    (isOpen ? disableScope : enableScope)("nav");
  }, [isOpen, disableScope, enableScope]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) setSelectedTab("chat");
    handleOpenChange(open);
  }, [handleOpenChange]);

  const renderMessage = useCallback((message: UIMessage, content: ReactNode) => {
    const props = getGeneratedCardsProps(message);
    if (!props || !props.template) return content;

    return <GeneratedCardsMessage {...props} />;
  }, [getGeneratedCardsProps]);

  const emptyState = (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-4 fg-level-3">
      <p>Generate cards, then use follow-up prompts to refine the previous result.</p>
      <p>Reset starts a fresh thread. Closing this dialog resets it too.</p>
    </div>
  );

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleDialogOpenChange}>
      <div className="relative">
        <Button
          variants={{ style: "dashed", size: "icon", class: "max-tb:hidden" }}
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
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(key) => setSelectedTab(key === "settings" ? "settings" : "chat")}
            >
              <Dialog.Header variants={{ class: "gap-4 py-0" }}>
                <Dialog.Title>{_(msg`generate-cards.title`)}</Dialog.Title>
                <Tabs.List aria-label={_(msg`generate-cards.title`)}>
                  <Tabs.Tab id="chat" aria-label={_(msg`generate-cards.settings.show-chat`)}>
                    <HugeiconsIcon className="size-6 min-w-6" strokeWidth={1.75} icon={Chat01Icon} aria-hidden="true" />
                  </Tabs.Tab>
                  <Tabs.Tab id="settings" aria-label={_(msg`generate-cards.settings.show-settings`)}>
                    <HugeiconsIcon
                      className="size-6 min-w-6"
                      strokeWidth={1.75}
                      icon={Settings01Icon}
                      aria-hidden="true"
                    />
                  </Tabs.Tab>
                </Tabs.List>
                <div className="grow" />
                <Dialog.Close slot="close" />
              </Dialog.Header>
              <Dialog.Content variants={{ class: "grow min-h-0 py-0" }}>
                <Tabs.Panels variants={{ class: "grow flex flex-col" }}>
                  <Tabs.Panel id="chat">
                    <div className="flex h-full min-h-0 flex-col">
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
                        emptyState={emptyState}
                        renderMessage={renderMessage}
                      />
                    </div>
                  </Tabs.Panel>
                  <Tabs.Panel id="settings">
                    <div className="grow overflow-auto">
                      <GenerateCardsPromptSettings
                        template={template}
                        provider={provider}
                        temperature={temperature}
                        onTemperatureChange={handleTemperatureChange}
                      />
                    </div>
                  </Tabs.Panel>
                </Tabs.Panels>
              </Dialog.Content>
            </Tabs>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
