import { LanguageSelect, motionSettingAtom, queriesAtom, themeAtom } from "@koloda/react";
import { MOTION_SETTINGS } from "@koloda/srs";
import type { Settings } from "@koloda/srs";
import { FormLayout, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";

export function SettingsInterface() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useAtom(themeAtom);
  const [motion, setMotion] = useAtom(motionSettingAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation({
    onSuccess: (settings: Settings | undefined) => {
      queryClient.setQueryData(["settings", "interface"], settings);
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
            setTheme(value.toString());
            mutate({ name: "interface", content: { theme: value } });
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
            setMotion(value.toString());
            mutate({ name: "interface", content: { motion: value } });
          }}
        >
          {Object.entries(MOTION_SETTINGS).map(([id, t]) => <ToggleGroup.Item id={id} key={id}>{_(t)}
          </ToggleGroup.Item>)}
        </ToggleGroup>
      </FormLayout.Section>
    </FormLayout>
  );
}
