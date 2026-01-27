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
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      mutate({ name: "learning", content: schema.parse(value) }, {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("learning") });
          queryClient.setQueryData(settingsQueryKeys.detail("learning"), returning);
          form.reset();
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
            onChange={field.handleChange as any}
          />
        )}
      </form.Field>
      <form.Field name="defaults.template">
        {(field) => (
          <TemplatePicker
            variants={{ layout: "form" }}
            label={_(msg`settings.learning.defaults.template`)}
            value={field.state.value}
            onChange={field.handleChange as any}
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
      <FormLayout.Section term={_(msg`settings.learning.learn-ahead-limit`)}>
        <div className="flex flex-row flex-wrap gap-4">
          <form.Field name="learnAheadLimit[0]">
            {(field) => (
              <NumberField
                variants={{ class: "flex-row items-center gap-2 max-w-32" }}
                aria-label={_(msg`settings.learning.learn-ahead-limit.hours.label`)}
                minValue={0}
                maxValue={48}
                value={field.state.value}
                onChange={field.handleChange}
              >
                <NumberField.Group />
                <span aria-hidden="true">{_(msg`settings.learning.learn-ahead-limit.hours.suffix`)}</span>
              </NumberField>
            )}
          </form.Field>
          <form.Field name="learnAheadLimit[1]">
            {(field) => (
              <NumberField
                variants={{ class: "flex-row items-center gap-2 max-w-32" }}
                aria-label={_(msg`settings.learning.learn-ahead-limit.minutes.label`)}
                minValue={0}
                maxValue={59}
                value={field.state.value}
                onChange={field.handleChange}
              >
                <NumberField.Group />
                <span aria-hidden="true">{_(msg`settings.learning.learn-ahead-limit.minutes.suffix`)}</span>
              </NumberField>
            )}
          </form.Field>
        </div>
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
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}
