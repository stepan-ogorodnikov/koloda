import { AIChat } from "@koloda/react";
import type { Deck, Template } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { UIMessage } from "ai";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { GeneratedCardsMessage } from "./generated-cards-message";
import { useGenerateCardsDialog } from "./use-generate-cards-dialog";

export type GenerateCardsProps = {
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function GenerateCards({ deckId, templateId }: GenerateCardsProps) {
  const { _ } = useLingui();
  const {
    isOpen,
    profileId,
    modelId,
    modelName,
    prompt,
    messages,
    hasProfiles,
    isGenerating,
    generateError,
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handlePromptChange,
    handleGenerate,
    getGeneratedCardsProps,
  } = useGenerateCardsDialog(deckId, templateId);

  const renderMessage = useCallback((message: UIMessage, content: ReactNode) => {
    const props = getGeneratedCardsProps(message);
    if (!props || !props.template) return content;

    return <GeneratedCardsMessage {...props} />;
  }, [getGeneratedCardsProps]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        variants={{ style: "dashed", size: "icon", class: "max-tb:hidden" }}
        aria-label={_(msg`generate-cards.trigger`)}
        isDisabled={!hasProfiles}
      >
        <Sparkles className="size-4" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "main" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`generate-cards.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <Dialog.Content variants={{ class: "grow min-h-0 py-0" }}>
              <AIChat
                profileId={profileId}
                modelId={modelId}
                modelName={modelName}
                input={prompt}
                messages={messages}
                onProfileChange={handleProfileChange}
                onModelChange={handleModelChange}
                onInputChange={handlePromptChange}
                onSubmit={handleGenerate}
                isLoading={isGenerating}
                error={generateError?.message}
                renderMessage={renderMessage}
              />
            </Dialog.Content>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
