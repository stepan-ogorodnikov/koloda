import { parseTime } from "@internationalized/date";
import { AlgorithmPicker, queriesAtom, settingsQueryKeys, TemplatePicker, useTitle } from "@koloda/react";
import type { LearningSettings } from "@koloda/srs";
import { learningSettingsMessages, learningSettingsValidation as schema } from "@koloda/srs";
import { formLayout, Label, NumberField, TimeField, useAppForm } from "@koloda/ui";
import { FormLayout } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export function SettingsLearning() {
  useTitle();
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { patchSettingsMutation, getSettingsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ ...getSettingsQuery("learning"), queryKey: settingsQueryKeys.detail("learning") });
  const { mutate } = useMutation(patchSettingsMutation());
  const form = useAppForm({
    defaultValues: data?.content as LearningSettings,
    validators: { onSubmit: schema, onChange: schema },
    listeners: {
      onChange: ({ formApi }) => {
        if (formApi.state.isValid) formApi.handleSubmit();
      },
      onChangeDebounceMs: 300,
    },
    onSubmit: async (data) => {
      mutate({ name: "learning", content: schema.parse({ ...data.value }) }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("learning") });
        },
      });
    },
  });
  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  return (
    <form
      className={formLayout}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Field name="defaults.algorithm">
        {(field) => (
          <AlgorithmPicker
            variants={{ layout: "form" }}
            label={_(msg`settings.learning.defaults.algorithm`)}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="defaults.template">
        {(field) => (
          <TemplatePicker
            variants={{ layout: "form" }}
            label={_(msg`settings.learning.defaults.template`)}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <FormLayout.Section term={_(msg`settings.learning.limits`)}>
        <form.Field name="dailyLimits.total">
          {(field) => (
            <NumberField
              minValue={0}
              value={field.state.value}
              onChange={field.handleChange}
            >
              <Label>{_(msg`settings.learning.limits.total`)}</Label>
              <NumberField.Group />
            </NumberField>
          )}
        </form.Field>
        <form.Field name="dailyLimits.untouched">
          {(field) => (
            <NumberField
              minValue={0}
              value={field.state.value}
              onChange={field.handleChange}
            >
              <Label>{_(msg`settings.learning.limits.untouched`)}</Label>
              <NumberField.Group />
            </NumberField>
          )}
        </form.Field>
        <form.Field name="dailyLimits.learn">
          {(field) => (
            <NumberField
              minValue={0}
              value={field.state.value}
              onChange={field.handleChange}
            >
              <Label>{_(msg`settings.learning.limits.learn`)}</Label>
              <NumberField.Group />
            </NumberField>
          )}
        </form.Field>
        <form.Field name="dailyLimits.review">
          {(field) => (
            <NumberField
              minValue={0}
              value={field.state.value}
              onChange={field.handleChange}
            >
              <Label>{_(msg`settings.learning.limits.review`)}</Label>
              <NumberField.Group />
            </NumberField>
          )}
        </form.Field>
      </FormLayout.Section>
      <form.Field name="dayStartsAt">
        {(field) => (
          <TimeField
            variants={{ layout: "form" }}
            label={_(msg`settings.learning.day-starts-at`)}
            value={field.state.value ? parseTime(field.state.value + ":00") : null}
            onChange={(value) => field.handleChange(value?.toString().slice(0, 5) ?? undefined)}
          >
            <TimeField.Input />
          </TimeField>
        )}
      </form.Field>
      {formErrorMap.onChange && <form.Errors errors={formErrorMap.onChange} translations={learningSettingsMessages} />}
      {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} translations={learningSettingsMessages} />}
    </form>
  );
}
