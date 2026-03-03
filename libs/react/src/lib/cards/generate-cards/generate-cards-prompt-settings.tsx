import { buildProviderFormatPrompt, buildSystemPrompt } from "@koloda/srs";
import type { AISecrets, Template } from "@koloda/srs";
import { Label, NumberField, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";

export type GenerateCardsPromptSettingsProps = {
  template: Template | null | undefined;
  provider: AISecrets["provider"] | null;
  temperature: number;
  onTemperatureChange: (value: number) => void;
};

export function GenerateCardsPromptSettings({
  template,
  provider,
  temperature,
  onTemperatureChange,
}: GenerateCardsPromptSettingsProps) {
  const { _ } = useLingui();
  const prompts = useMemo(() => {
    return template?.content?.fields
      ? {
        system: buildSystemPrompt(template.content.fields),
        provider: (!provider || provider === "openrouter") ? "" : buildProviderFormatPrompt(template.content.fields),
      }
      : { system: "", provider: "" };
  }, [provider, template]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <TextField value={prompts.system}>
        <Label>{_(msg`generate-cards.settings.system-prompt.label`)}</Label>
        <TextField.TextArea
          variants={{ style: "normal" }}
          rows={8}
          readOnly
        />
      </TextField>
      <TextField value={prompts.provider}>
        <Label>{_(msg`generate-cards.settings.provider-prompt.label`)}</Label>
        <TextField.TextArea
          variants={{ style: "normal" }}
          rows={6}
          readOnly
        />
      </TextField>
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
