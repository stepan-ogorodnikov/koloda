import { MOTION_SETTINGS } from "@koloda/app";
import type { AllowedSettings } from "@koloda/app";
import { schemeAtom } from "@koloda/core-react";
import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { FormLayout, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { DarkThemePicker, LightThemePicker } from "./interface-controls/color-theme-picker";
import { LanguagePicker } from "./interface-controls/language-picker";

export function SettingsInterface() {
  useTitle();
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const scheme = useAtomValue(schemeAtom);
  const setScheme = useSetAtom(schemeAtom);
  const motion = useAtomValue(motionSettingAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation({
    onSuccess: (settings: AllowedSettings<"interface"> | undefined) => {
      queryClient.setQueryData(queryKeys.settings.detail("interface"), settings);
    },
    ...patchSettingsMutation(),
  });

  return (
    <FormLayout>
      <LanguagePicker variants={{ layout: "form" }} label={_(msg`settings.interface.language`)} withIcon={false} />
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
            mutate({ name: "interface", content: { motion: value.toString() } });
          }}
        >
          {Object.entries(MOTION_SETTINGS).map(([id, t]) => (
            <ToggleGroup.Item id={id} key={id}>
              {_(t)}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup>
      </FormLayout.Section>
    </FormLayout>
  );
}
