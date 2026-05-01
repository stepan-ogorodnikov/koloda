import { compilePromptTemplate, DEFAULT_CHAT_PROMPT_TEMPLATE, DEFAULT_GENERATION_PROMPT_TEMPLATE } from "@koloda/ai";
import type { AISecrets } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { Label, NumberField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";
import { AIChatSettingsPromptEditor } from "./ai-chat-settings-prompt-editor";
import { AIChatSettingsVariables } from "./ai-chat-settings-variables";

export type AIChatSettingsProps = {
  template: Template | null | undefined;
  provider: AISecrets["provider"] | null;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  onCardsPromptChange: (value: string | null) => void;
  onChatPromptChange: (value: string | null) => void;
};

export function AIChatSettings({
  template,
  provider,
  temperature,
  onTemperatureChange,
  cardsPromptTemplate,
  chatPromptTemplate,
  onCardsPromptChange,
  onChatPromptChange,
}: AIChatSettingsProps) {
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
      cardsPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
      template.content.fields,
      provider,
      "generation",
    );
  }, [cardsPromptTemplate, provider, template]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <AIChatSettingsPromptEditor
        label={_(msg`ai-chat.settings.system-prompt.chat.label`)}
        rows={6}
        templateValue={chatPromptTemplate}
        defaultTemplate={DEFAULT_CHAT_PROMPT_TEMPLATE}
        preview={chatPreview}
        onChange={onChatPromptChange}
      />

      <AIChatSettingsPromptEditor
        label={_(msg`ai-chat.settings.system-prompt.cards.label`)}
        rows={10}
        templateValue={cardsPromptTemplate}
        defaultTemplate={DEFAULT_GENERATION_PROMPT_TEMPLATE}
        preview={generationPreview}
        onChange={onCardsPromptChange}
      />

      <AIChatSettingsVariables />

      <NumberField
        minValue={0}
        maxValue={2}
        step={0.1}
        value={temperature}
        onChange={(value) => onTemperatureChange(value)}
      >
        <Label>{_(msg`ai-chat.settings.temperature.label`)}</Label>
        <NumberField.Group />
      </NumberField>
    </div>
  );
}
