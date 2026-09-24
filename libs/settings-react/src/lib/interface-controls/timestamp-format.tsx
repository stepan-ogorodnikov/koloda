import { formatTimestamp, interfaceSettingsValidation } from "@koloda/app";
import type { ErrorCode, TimestampKind } from "@koloda/app";
import { dateFormatAtom, langAtom, queriesAtom, queryKeys, timeFormatAtom } from "@koloda/core-react";
import type { AllowedSettings } from "@koloda/settings";
import { FormLayout, Select, TextField } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

const LOCALE_OPTION = "locale";
// WHY: underscore fails the token whitelist, so this id can never collide with a storable pattern.
const CUSTOM_OPTION = "__custom";

export type TimestampFormatPreset = {
  value: string;
  /** Displayed instead of the raw pattern when present. */
  label?: MessageDescriptor;
};

function toOption(presets: readonly TimestampFormatPreset[], allowsCustom: boolean, value: string): string {
  if (value === LOCALE_OPTION || presets.some((preset) => preset.value === value)) {
    return value;
  }
  // WHY: A stored custom date pattern maps to Custom; without a custom option (time) it stays its own row.
  return allowsCustom ? CUSTOM_OPTION : value;
}

export type TimestampFormatSectionProps = {
  kind: TimestampKind;
  label: MessageDescriptor;
  localeLabel: MessageDescriptor;
  /** Present only where the select offers Custom: reveals the pattern field row. */
  customLabel?: MessageDescriptor;
  preview: (formatted: string) => string;
  presets: readonly TimestampFormatPreset[];
};

export function TimestampFormatSection({
  kind,
  label,
  localeLabel,
  customLabel,
  preview,
  presets,
}: TimestampFormatSectionProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const locale = useAtomValue(langAtom);
  const savedDate = useAtomValue(dateFormatAtom);
  const savedTime = useAtomValue(timeFormatAtom);
  const setDateFormat = useSetAtom(dateFormatAtom);
  const setTimeFormat = useSetAtom(timeFormatAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation({
    onSuccess: (settings: AllowedSettings<"interface"> | undefined) => {
      queryClient.setQueryData(queryKeys.settings.detail("interface"), settings);
    },
    ...patchSettingsMutation(),
  });

  const allowsCustom = customLabel != null;
  const saved = kind === "date" ? savedDate : savedTime;
  const schema =
    kind === "date" ? interfaceSettingsValidation.shape.dateFormat : interfaceSettingsValidation.shape.timeFormat;
  const errorCode: ErrorCode =
    kind === "date" ? "validation.settings-interface.date-format" : "validation.settings-interface.time-format";
  const [selection, setSelection] = useState(() => toOption(presets, allowsCustom, saved));
  const [pattern, setPattern] = useState(saved === LOCALE_OPTION ? "" : saved);
  const [error, setError] = useState<ErrorCode | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());

  // WHY: re-echo the saved value whenever it changes (hydration, preset pick, own commit) so the
  // select and field never drift from the setting and stale errors do not linger.
  useEffect(() => {
    setSelection(toOption(presets, allowsCustom, saved));
    setPattern(saved === LOCALE_OPTION ? "" : saved);
    setError(undefined);
  }, [saved, presets, allowsCustom]);

  // WHY: the preview promises the current date/time, so the clock keeps running while the page
  // sits idle; 1s because a custom pattern can show seconds (presets are minute-granular).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const save = (value: string) => {
    const content = kind === "date" ? { dateFormat: value } : { timeFormat: value };
    (kind === "date" ? setDateFormat : setTimeFormat)(value);
    mutate({ name: "interface", content });
  };

  const onChange = (key: string | number | null) => {
    if (key == null) {
      return;
    }
    const next = key.toString();
    setSelection(next);
    setError(undefined);
    if (next !== CUSTOM_OPTION) {
      save(next);
    }
  };

  const commit = () => {
    // WHY: Empty means "nothing chosen yet": stay on Custom without writing or erroring.
    if (pattern === "" || pattern === saved) {
      setError(undefined);
      return;
    }
    if (!schema.safeParse(pattern).success) {
      setError(errorCode);
      return;
    }
    setError(undefined);
    save(pattern);
  };

  const options = [
    { id: LOCALE_OPTION, text: _(localeLabel) },
    ...presets.map((preset) => ({ id: preset.value, text: preset.label ? _(preset.label) : preset.value })),
    ...(customLabel ? [{ id: CUSTOM_OPTION, text: _(customLabel) }] : []),
    ...(!allowsCustom && saved !== LOCALE_OPTION && !presets.some((preset) => preset.value === saved)
      ? [{ id: saved, text: saved }]
      : []),
  ];

  const previewPattern = schema.safeParse(pattern).success ? pattern : saved;
  const previewFormats =
    kind === "date"
      ? { dateFormat: previewPattern, timeFormat: savedTime }
      : { dateFormat: savedDate, timeFormat: previewPattern };
  const previewValue = formatTimestamp(now, kind, previewFormats, locale);

  return (
    <FormLayout.Section term={_(label)}>
      <div className="flex flex-col gap-3">
        {/* WHY: the row's max-content (select + field + gaps) decides whether the wd:flex-wrap
          section stacks under its label, so the field's w-60 pins its footprint to the control
          width; flex-wrap drops the field onto its own line instead when the column is tight. */}
        <div className="flex flex-wrap items-start gap-2">
          {/* WHY: form layout mirrors the other selects' max-w-60; min-w-60 floors the fit-content cell. */}
          <Select
            popoverVariants={{ class: "min-w-48 w-[var(--trigger-width)]" }}
            buttonVariants={{ layout: "form", class: "min-w-60" }}
            aria-label={_(label)}
            items={options}
            value={selection}
            onChange={onChange}
          >
            {({ id, text }) => (
              <Select.ListBoxItem id={id} textValue={text} key={id}>
                {text}
              </Select.ListBoxItem>
            )}
          </Select>
          {customLabel != null && selection === CUSTOM_OPTION && (
            <div className="flex flex-col gap-2 w-60">
              <TextField
                aria-label={_(customLabel)}
                value={pattern}
                onChange={setPattern}
                onBlur={commit}
                isInvalid={Boolean(error)}
              >
                <TextField.Input
                  placeholder={presets[0].value}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit();
                    }
                  }}
                />
              </TextField>
              {error && <TextField.Errors errors={[{ message: error }]} />}
            </div>
          )}
        </div>
        <p className="fg-level-4 text-sm">{preview(previewValue)}</p>
      </div>
    </FormLayout.Section>
  );
}
