import { ERROR_MESSAGES, formatAppError, MOTION_SETTINGS } from "@koloda/app";
import { schemeAtom } from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { ErrorMessage, FormLayout, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { DarkThemePicker, LightThemePicker } from "./interface-controls/color-theme-picker";
import { LanguagePicker } from "./interface-controls/language-picker";
import { TimestampFormatSection } from "./interface-controls/timestamp-format";
import {
  useInterfaceSettingWrite,
  useInterfaceSettingWriteError,
} from "./interface-controls/use-interface-setting-write";

const DATE_FORMAT_PRESETS = [{ value: "yyyy-MM-dd" }, { value: "dd.MM.yyyy" }, { value: "MM/dd/yyyy" }];
const TIME_FORMAT_PRESETS = [
  { value: "hh:mm a", label: msg`settings.interface.time-format.12-hour` },
  { value: "HH:mm", label: msg`settings.interface.time-format.24-hour` },
];

export function SettingsInterface() {
  const { _ } = useLingui();
  const scheme = useAtomValue(schemeAtom);
  const motion = useAtomValue(motionSettingAtom);
  const write = useInterfaceSettingWrite();
  const writeError = useInterfaceSettingWriteError();

  return (
    <FormLayout>
      {writeError && (
        <div role="alert">
          <ErrorMessage {...formatAppError(writeError, _, ERROR_MESSAGES["db.update"])} layout="inline" />
        </div>
      )}
      <LanguagePicker variants={{ layout: "form" }} label={_(msg`settings.interface.language`)} showIcon={false} />
      <FormLayout.Section term={_(msg`settings.interface.scheme`)}>
        <ToggleGroup
          disallowEmptySelection
          selectedKeys={[scheme]}
          onSelectionChange={([value]) => write("scheme", value.toString())}
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
          disallowEmptySelection
          selectedKeys={[motion]}
          onSelectionChange={([value]) => write("motion", value.toString())}
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
