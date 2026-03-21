import { parseTime } from "@internationalized/date";
import { AlgorithmPicker, TemplatePicker } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { ResolvedLearningSettings } from "@koloda/srs";
import { learningSettingsValidation, resolvedLearningSettingsValidation, toFormErrors } from "@koloda/srs";
import { formLayout, Label, NumberField, Switch, TimeField, useAppForm } from "@koloda/ui";
import { FormLayout } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export type SettingsLearningProps = { data: ResolvedLearningSettings };

export function SettingsLearning({ data }: SettingsLearningProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { setSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(setSettingsMutation<"learning">());
  const initialValues = learningSettingsValidation.parse(data);

  const form = useAppForm({
    defaultValues: initialValues,
    validators: { onSubmit: resolvedLearningSettingsValidation },
    onSubmit: async ({ formApi, value }) => {
      mutate({ name: "learning", content: value }, {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("learning") });
          queryClient.setQueryData(queryKeys.settings.detail("learning"), returning);
          formApi.reset(returning?.content ? learningSettingsValidation.parse(returning.content) : undefined);
        },
        onError: (error) => {
          formApi.setErrorMap({ onSubmit: toFormErrors(error) });
        },
      });
    },
  });

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
        <div className="flex flex-row flex-wrap items-end gap-4">
          <form.Field name="dailyLimits.untouched.value">
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
          <form.Field name="dailyLimits.untouched.counts">
            {(field) => (
              <Switch
                isSelected={field.state.value}
                onChange={field.handleChange}
              >
                <Switch.Indicator />
                <Switch.Label>{_(msg`settings.learning.limits.counts-towards-total`)}</Switch.Label>
              </Switch>
            )}
          </form.Field>
        </div>
        <div className="flex flex-row flex-wrap items-end gap-4">
          <form.Field name="dailyLimits.learn.value">
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
          <form.Field name="dailyLimits.learn.counts">
            {(field) => (
              <Switch
                isSelected={field.state.value}
                onChange={field.handleChange}
              >
                <Switch.Indicator />
                <Switch.Label>{_(msg`settings.learning.limits.counts-towards-total`)}</Switch.Label>
              </Switch>
            )}
          </form.Field>
        </div>
        <div className="flex flex-row flex-wrap items-end gap-4">
          <form.Field name="dailyLimits.review.value">
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
          <form.Field name="dailyLimits.review.counts">
            {(field) => (
              <Switch
                isSelected={field.state.value}
                onChange={field.handleChange}
              >
                <Switch.Indicator />
                <Switch.Label>{_(msg`settings.learning.limits.counts-towards-total`)}</Switch.Label>
              </Switch>
            )}
          </form.Field>
        </div>
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
            onChange={(value) => field.handleChange(value?.toString().slice(0, 5) ?? field.state.value)}
          >
            <TimeField.Input />
          </TimeField>
        )}
      </form.Field>
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}
