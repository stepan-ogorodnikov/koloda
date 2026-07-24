import type { AssistantSettings as AssistantSettingsType } from "@koloda/ai";
import {
  assistantSettingsFormSchema,
  assistantSettingsValidation,
  compilePromptTemplate,
  DEFAULT_CHAT_PROMPT_TEMPLATE,
  DEFAULT_GENERATION_PROMPT_TEMPLATE,
} from "@koloda/ai";
import type { AISecrets } from "@koloda/ai";
import { toFormErrors } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { Label, Slider, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { AssistantSettingsPromptEditor } from "./assistant-settings-prompt-editor";
import { AssistantSettingsVariables } from "./assistant-settings-variables";

export type AssistantSettingsProps = {
  template: Template | null | undefined;
  provider: AISecrets["provider"] | null;
};

export function AssistantSettings({ template, provider }: AssistantSettingsProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { getSettingsQuery, patchSettingsMutation } = useAtomValue(queriesAtom);
  const { data } = useQuery({ ...getSettingsQuery("ai"), queryKey: queryKeys.settings.detail("ai") });
  const { mutate } = useMutation(patchSettingsMutation());

  const assistantSettings = data?.content?.assistant as AssistantSettingsType | undefined;
  const defaultValues = {
    temperature: assistantSettings?.temperature ?? 0.2,
    cardsPromptTemplate: assistantSettings?.cardsPromptTemplate ?? null,
    chatPromptTemplate: assistantSettings?.chatPromptTemplate ?? null,
  };

  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: assistantSettingsFormSchema },
    onSubmit: async ({ formApi, value }) => {
      mutate(
        {
          name: "ai",
          content: { assistant: assistantSettingsValidation.parse(value) },
        },
        {
          onSuccess: (returning) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
            queryClient.setQueryData(queryKeys.settings.detail("ai"), returning);
            formApi.reset(value);
          },
          onError: (error) => {
            formApi.setErrorMap({ onSubmit: toFormErrors(error) });
          },
        },
      );
    },
  });

  useEffect(() => {
    if (data) form.reset();
  }, [data, form]);

  const chatPromptTemplate = form.getFieldValue("chatPromptTemplate") ?? DEFAULT_CHAT_PROMPT_TEMPLATE;
  const cardsPromptTemplate = form.getFieldValue("cardsPromptTemplate") ?? DEFAULT_GENERATION_PROMPT_TEMPLATE;

  const chatPreview = useMemo(
    () => compilePromptTemplate(chatPromptTemplate, template?.content?.fields ?? [], provider, "chat"),
    [chatPromptTemplate, provider, template],
  );

  const generationPreview = useMemo(
    () => compilePromptTemplate(cardsPromptTemplate, template?.content?.fields ?? [], provider, "generation"),
    [cardsPromptTemplate, provider, template],
  );

  return (
    <form
      className="self-center grow flex flex-col gap-6 w-full max-w-3xl px-2"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Field name="chatPromptTemplate">
        {(field) => (
          <AssistantSettingsPromptEditor
            label={_(msg`assistant.settings.system-prompt.chat.label`)}
            rows={1}
            maxRows={6}
            templateValue={field.state.value}
            defaultTemplate={DEFAULT_CHAT_PROMPT_TEMPLATE}
            preview={chatPreview}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="cardsPromptTemplate">
        {(field) => (
          <AssistantSettingsPromptEditor
            label={_(msg`assistant.settings.system-prompt.cards.label`)}
            rows={5}
            maxRows={10}
            templateValue={field.state.value}
            defaultTemplate={DEFAULT_GENERATION_PROMPT_TEMPLATE}
            preview={generationPreview}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <AssistantSettingsVariables />
      <form.Field name="temperature">
        {(field) => (
          <Slider minValue={0} maxValue={2} step={0.1} value={field.state.value} onChange={field.handleChange}>
            <Label>{_(msg`assistant.settings.temperature.label`)}</Label>
            <Slider.Container>
              <Slider.Track>
                <Slider.Thumb />
              </Slider.Track>
            </Slider.Container>
          </Slider>
        )}
      </form.Field>
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}
