import { MOTION_SETTINGS } from "@koloda/app";
import type { AllowedSettings } from "@koloda/app";
import { themeAtom } from "@koloda/core-react";
import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { FormLayout, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { LanguageSelect } from "./interface-controls/language-select";

export function SettingsInterface() {
  useTitle();
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const theme = useAtomValue(themeAtom);
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
      <LanguageSelect variants={{ layout: "form" }} label={_(msg`settings.interface.language`)} withIcon={false} />
      <FormLayout.Section term={_(msg`settings.interface.theme`)}>
        <ToggleGroup
          selectedKeys={[theme]}
          onSelectionChange={([value]) => {
            mutate({ name: "interface", content: { theme: value.toString() } });
          }}
        >
          <ToggleGroup.Item id="light">{_(msg`theme.light`)}</ToggleGroup.Item>
          <ToggleGroup.Item id="dark">{_(msg`theme.dark`)}</ToggleGroup.Item>
          <ToggleGroup.Item id="system">{_(msg`theme.system`)}</ToggleGroup.Item>
        </ToggleGroup>
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`settings.interface.motion`)}>
        <ToggleGroup
          selectedKeys={[motion]}
          onSelectionChange={([value]) => {
            mutate({ name: "interface", content: { motion: value.toString() } });
          }}
        >
          {Object.entries(MOTION_SETTINGS).map(([id, t]) => <ToggleGroup.Item id={id} key={id}>{_(t)}
          </ToggleGroup.Item>)}
        </ToggleGroup>
      </FormLayout.Section>
    </FormLayout>
  );
}
