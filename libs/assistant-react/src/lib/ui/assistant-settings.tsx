import type { AssistantSettings as AssistantSettingsType } from "@koloda/ai";
import {
  assistantSettingsFormSchema,
  assistantSettingsValidation,
  DEFAULT_CHAT_PROMPT_TEMPLATE,
  resolveChatPromptMode,
} from "@koloda/ai";
import { toFormErrors } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Dialog, Label, Slider, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { AssistantSettingsPromptEditor } from "./assistant-settings-prompt-editor";

export type AssistantSettingsProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

function toFormValues(assistant: AssistantSettingsType | undefined) {
  return {
    temperature: assistant?.temperature ?? 0.2,
    chatPromptTemplate: assistant?.chatPromptTemplate ?? null,
    chatPromptMode: resolveChatPromptMode(assistant ?? {}),
  };
}

export function AssistantSettings({ isOpen, onOpenChange }: AssistantSettingsProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { getSettingsQuery, patchSettingsMutation } = useAtomValue(queriesAtom);
  const { data } = useQuery(getSettingsQuery("ai"));
  const { mutate } = useMutation(patchSettingsMutation());

  const assistantSettings = data?.content?.assistant as AssistantSettingsType | undefined;
  const defaultValues = toFormValues(assistantSettings);

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
    if (!data) return;
    const assistant = data.content?.assistant as AssistantSettingsType | undefined;
    form.reset(toFormValues(assistant));
  }, [data, form]);

  const handleOpenChange = (next: boolean) => {
    // WHY: Overlay can keep the form mounted while closing; reset so the next
    // open does not restore discarded edits.
    if (!next) {
      const assistant = data?.content?.assistant as AssistantSettingsType | undefined;
      form.reset(toFormValues(assistant));
    }
    onOpenChange(next);
  };

  return (
    <Dialog.Overlay isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Modal variants={{ size: "large", class: "w-full max-w-3xl h-[min(48rem,100%)]" }}>
        <Dialog.Body>
          <Dialog.Header>
            <Dialog.Title>{_(msg`assistant.settings.title`)}</Dialog.Title>
            <div className="grow" />
            <Dialog.Close slot="close" />
          </Dialog.Header>
          <form
            className="grow min-h-0 flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Dialog.Content variants={{ class: "gap-6 min-h-0 overflow-hidden" }}>
              <form.Subscribe
                selector={(state) => ({
                  chatPromptMode: state.values.chatPromptMode,
                  chatPromptTemplate: state.values.chatPromptTemplate,
                })}
              >
                {({ chatPromptMode, chatPromptTemplate }) => (
                  <AssistantSettingsPromptEditor
                    label={_(msg`assistant.settings.system-prompt.label`)}
                    mode={chatPromptMode}
                    templateValue={chatPromptTemplate}
                    defaultTemplate={DEFAULT_CHAT_PROMPT_TEMPLATE}
                    onModeChange={(mode) => form.setFieldValue("chatPromptMode", mode)}
                    onChange={(value) => form.setFieldValue("chatPromptTemplate", value)}
                  />
                )}
              </form.Subscribe>
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
            </Dialog.Content>
          </form>
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}
