import { parseTime } from "@internationalized/date";
import { timeFieldFormatOptions, toFormErrors } from "@koloda/app";
import { learningSettingsValidation, resolvedLearningSettingsValidation } from "@koloda/app";
import type { ResolvedLearningSettings } from "@koloda/app";
import { queriesAtom, queryKeys, timeFormatAtom } from "@koloda/core-react";
import { AlgorithmPicker } from "@koloda/srs-react";
import { TemplatePicker } from "@koloda/srs-react";
import { formLayout, Label, NumberField, Switch, TimeField, useAppForm, useRefreshPristineFields } from "@koloda/ui";
import { FormLayout } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useRef } from "react";

// WHY: `NumberField` takes these in place of its own `formatOptions`, so `useGrouping: false` is repeated.
// No fraction digits keeps a typed 1.5 from reaching the save; every learning limit is a whole number.
const wholeNumberFormatOptions: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 0 };

export type SettingsLearningProps = { data: ResolvedLearningSettings };

// WHY: a cap that loaded as unlimited has no last number, and 0 is a hard cap (LEARNING-SETTINGS.md, Daily Limits).
// So turning Unlimited off fills in the first-setup number. Learn starts unlimited and has none; 200 matches Review
// and, since Learn does not count toward Total on first setup, does not block a save.
const UNLIMITED_OFF_VALUES = { total: 200, untouched: 50, learn: 200, review: 200 } as const;

// INVARIANT: one path per learning sync key (crates/koloda-sync-proto/PROTOCOL.md, Field groups and merge).
const LEARNING_SYNC_GROUPS = [
  "defaults.algorithm",
  "defaults.template",
  "dailyLimits",
  "dayStartsAt",
  "learnAheadLimit",
] as const;

export type DailyLimitCapFieldProps = {
  label: string;
  unlimitedLabel: string;
  unlimitedOffValue: number;
  value: number | null;
  onChange: (value: number | null) => void;
};

export function DailyLimitCapField({
  label,
  unlimitedLabel,
  unlimitedOffValue,
  value,
  onChange,
}: DailyLimitCapFieldProps) {
  const lastNumber = useRef(value ?? unlimitedOffValue);
  if (typeof value === "number") lastNumber.current = value;
  const isUnlimited = value == null;

  return (
    <div className="flex flex-row flex-wrap items-end gap-4">
      <NumberField
        minValue={0}
        formatOptions={wholeNumberFormatOptions}
        isDisabled={isUnlimited}
        value={isUnlimited ? lastNumber.current : value}
        onChange={(next) => {
          lastNumber.current = next;
          onChange(next);
        }}
      >
        <Label>{label}</Label>
        <NumberField.Group />
      </NumberField>
      <Switch isSelected={isUnlimited} onChange={(isSelected) => onChange(isSelected ? null : lastNumber.current)}>
        <Switch.Indicator />
        <Switch.Label>{unlimitedLabel}</Switch.Label>
      </Switch>
    </div>
  );
}

export function SettingsLearning({ data }: SettingsLearningProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { setSettingsMutation } = useAtomValue(queriesAtom);
  const timeFormat = useAtomValue(timeFormatAtom);
  const timeFieldOptions = timeFieldFormatOptions(timeFormat);
  const { mutate } = useMutation(setSettingsMutation<"learning">());
  const initialValues = learningSettingsValidation.parse(data);

  const form = useAppForm({
    defaultValues: initialValues,
    validators: { onSubmit: resolvedLearningSettingsValidation },
    onSubmit: async ({ formApi, value }) => {
      mutate(
        { name: "learning", content: value },
        {
          onSuccess: (returning) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("learning") });
            // WHY: today's totals carry the daily limits and the learning-day window; the desktop sync
            // `settings.learning` entry refreshes them too (apps/electron-react/src/app/sync-events.ts).
            queryClient.invalidateQueries({ queryKey: queryKeys.lessons.todayReviewTotals() });
            queryClient.setQueryData(queryKeys.settings.detail("learning"), returning);
            formApi.reset(returning?.content ? learningSettingsValidation.parse(returning.content) : undefined);
          },
          onError: (error) => {
            formApi.setErrorMap({ onSubmit: toFormErrors(error) });
          },
        },
      );
    },
  });
  useRefreshPristineFields(form, initialValues, LEARNING_SYNC_GROUPS);

  const unlimitedLabel = _(msg`settings.learning.limits.unlimited`);

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
            <DailyLimitCapField
              label={_(msg`settings.learning.limits.total`)}
              unlimitedLabel={unlimitedLabel}
              unlimitedOffValue={UNLIMITED_OFF_VALUES.total}
              value={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <div className="flex flex-row flex-wrap items-end gap-4">
          <form.Field name="dailyLimits.untouched.value">
            {(field) => (
              <DailyLimitCapField
                label={_(msg`settings.learning.limits.untouched`)}
                unlimitedLabel={unlimitedLabel}
                unlimitedOffValue={UNLIMITED_OFF_VALUES.untouched}
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="dailyLimits.untouched.counts">
            {(field) => (
              <Switch isSelected={field.state.value} onChange={field.handleChange}>
                <Switch.Indicator />
                <Switch.Label>{_(msg`settings.learning.limits.counts-towards-total`)}</Switch.Label>
              </Switch>
            )}
          </form.Field>
        </div>
        <div className="flex flex-row flex-wrap items-end gap-4">
          <form.Field name="dailyLimits.learn.value">
            {(field) => (
              <DailyLimitCapField
                label={_(msg`settings.learning.limits.learn`)}
                unlimitedLabel={unlimitedLabel}
                unlimitedOffValue={UNLIMITED_OFF_VALUES.learn}
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="dailyLimits.learn.counts">
            {(field) => (
              <Switch isSelected={field.state.value} onChange={field.handleChange}>
                <Switch.Indicator />
                <Switch.Label>{_(msg`settings.learning.limits.counts-towards-total`)}</Switch.Label>
              </Switch>
            )}
          </form.Field>
        </div>
        <div className="flex flex-row flex-wrap items-end gap-4">
          <form.Field name="dailyLimits.review.value">
            {(field) => (
              <DailyLimitCapField
                label={_(msg`settings.learning.limits.review`)}
                unlimitedLabel={unlimitedLabel}
                unlimitedOffValue={UNLIMITED_OFF_VALUES.review}
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="dailyLimits.review.counts">
            {(field) => (
              <Switch isSelected={field.state.value} onChange={field.handleChange}>
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
                formatOptions={wholeNumberFormatOptions}
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
                formatOptions={wholeNumberFormatOptions}
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
            hourCycle={timeFieldOptions.hourCycle}
            shouldForceLeadingZeros={timeFieldOptions.shouldForceLeadingZeros}
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
