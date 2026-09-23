import { MOTION_SETTINGS } from "@koloda/app";
import type { AllowedSettings } from "@koloda/settings";
import { schemeAtom } from "@koloda/core-react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { FormLayout, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { DarkThemePicker, LightThemePicker } from "./interface-controls/color-theme-picker";
import { LanguagePicker } from "./interface-controls/language-picker";
import { TimestampFormatSection } from "./interface-controls/timestamp-format";

const DATE_FORMAT_PRESETS = [{ value: "yyyy-MM-dd" }, { value: "dd.MM.yyyy" }, { value: "MM/dd/yyyy" }];
const TIME_FORMAT_PRESETS = [
  { value: "hh:mm a", label: msg`settings.interface.time-format.12-hour` },
  { value: "HH:mm", label: msg`settings.interface.time-format.24-hour` },
];

export function SettingsInterface() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const scheme = useAtomValue(schemeAtom);
  const setScheme = useSetAtom(schemeAtom);
  const motion = useAtomValue(motionSettingAtom);
  const setMotion = useSetAtom(motionSettingAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation({
    onSuccess: (settings: AllowedSettings<"interface"> | undefined) => {
      queryClient.setQueryData(queryKeys.settings.detail("interface"), settings);
    },
    ...patchSettingsMutation(),
  });

  return (
    <FormLayout>
      <LanguagePicker variants={{ layout: "form" }} label={_(msg`settings.interface.language`)} showIcon={false} />
      <FormLayout.Section term={_(msg`settings.interface.scheme`)}>
        <ToggleGroup
          selectedKeys={[scheme]}
          onSelectionChange={([value]) => {
            const next = value.toString();
            setScheme(next);
            mutate({ name: "interface", content: { scheme: next } });
          }}
        >
          <ToggleGroup.Item id="light">{_(msg`scheme.light`)}</ToggleGroup.Item>
          <ToggleGroup.Item id="dark">{_(msg`scheme.dark`)}</ToggleGroup.Item>
          <ToggleGroup.Item id="system">{_(msg`scheme.system`)}</ToggleGroup.Item>
        </ToggleGroup>
      </FormLayout.Section>
      <LightThemePicker variants={{ layout: "form" }} />
      <DarkThemePicker variants={{ layout: "form" }} />
      <FormLayout.Section term={_(msg`settings.interface.motion`)}>
        <ToggleGroup
          selectedKeys={[motion]}
          onSelectionChange={([value]) => {
            const next = value.toString();
            setMotion(next);
            mutate({ name: "interface", content: { motion: next } });
          }}
        >
          {Object.entries(MOTION_SETTINGS).map(([id, t]) => (
            <ToggleGroup.Item id={id} key={id}>
              {_(t)}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup>
      </FormLayout.Section>
      <TimestampFormatSection
        kind="date"
        label={msg`settings.interface.date-format`}
        localeLabel={msg`settings.interface.date-format.locale`}
        customLabel={msg`settings.interface.date-format.custom`}
        preview={(value) => _(msg`settings.interface.date-format.preview ${value}`)}
        presets={DATE_FORMAT_PRESETS}
      />
      <TimestampFormatSection
        kind="time"
        label={msg`settings.interface.time-format`}
        localeLabel={msg`settings.interface.time-format.locale`}
        preview={(value) => _(msg`settings.interface.time-format.preview ${value}`)}
        presets={TIME_FORMAT_PRESETS}
      />
    </FormLayout>
  );
}
