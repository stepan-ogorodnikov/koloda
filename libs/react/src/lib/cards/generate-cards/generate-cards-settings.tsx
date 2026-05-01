import { compilePromptTemplate, DEFAULT_CHAT_PROMPT_TEMPLATE, DEFAULT_GENERATION_PROMPT_TEMPLATE } from "@koloda/ai";
import type { AISecrets } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { Label, NumberField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";
import { GenerateCardsSettingsPromptEditor } from "./generate-cards-settings-prompt-editor";
import { GenerateCardsSettingsVariables } from "./generate-cards-settings-variables";

export type GenerateCardsSettingsProps = {
  template: Template | null | undefined;
  provider: AISecrets["provider"] | null;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  generationPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  onGenerationPromptChange: (value: string | null) => void;
  onChatPromptChange: (value: string | null) => void;
};

export function GenerateCardsSettings({
  template,
  provider,
  temperature,
  onTemperatureChange,
  generationPromptTemplate,
  chatPromptTemplate,
  onGenerationPromptChange,
  onChatPromptChange,
}: GenerateCardsSettingsProps) {
  const { _ } = useLingui();

  const chatPreview = useMemo(() => {
    if (!template?.content?.fields) return "";
    return compilePromptTemplate(
      chatPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
      template.content.fields,
      provider,
      "chat",
    );
  }, [chatPromptTemplate, provider, template]);

  const generationPreview = useMemo(() => {
    if (!template?.content?.fields) return "";
    return compilePromptTemplate(
      generationPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
      template.content.fields,
      provider,
      "generation",
    );
  }, [generationPromptTemplate, provider, template]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <GenerateCardsSettingsPromptEditor
        label={_(msg`generate-cards.settings.system-prompt.chat.label`)}
        rows={6}
        templateValue={chatPromptTemplate}
        defaultTemplate={DEFAULT_CHAT_PROMPT_TEMPLATE}
        preview={chatPreview}
        onChange={onChatPromptChange}
      />

      <GenerateCardsSettingsPromptEditor
        label={_(msg`generate-cards.settings.system-prompt.generate.label`)}
        rows={10}
        templateValue={generationPromptTemplate}
        defaultTemplate={DEFAULT_GENERATION_PROMPT_TEMPLATE}
        preview={generationPreview}
        onChange={onGenerationPromptChange}
      />

      <GenerateCardsSettingsVariables />

      <NumberField
        minValue={0}
        maxValue={2}
        step={0.1}
        value={temperature}
        onChange={(value) => onTemperatureChange(value)}
      >
        <Label>{_(msg`generate-cards.settings.temperature.label`)}</Label>
        <NumberField.Group />
      </NumberField>
    </div>
  );
}
