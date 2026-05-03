import { ComputerSettingsIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { THEMES } from "@koloda/app";
import { themeAtom } from "@koloda/core-react";
import { queriesAtom } from "@koloda/core-react";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";

const ITEMS = [
  { id: "light", Icon: Sun03Icon },
  { id: "dark", Icon: Moon02Icon },
  { id: "system", Icon: ComputerSettingsIcon },
] as const;

type ThemeSelectProps = Partial<SelectProps<typeof ITEMS[number]>> & {
  isPersisted?: boolean;
};

export function ThemeSelect({ isPersisted = true, ...props }: ThemeSelectProps) {
  const { _ } = useLingui();
  const [theme, setTheme] = useAtom(themeAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(patchSettingsMutation());

  return (
    <Select
      aria-label={_(msg`theme-select.label`)}
      items={ITEMS}
      value={theme}
      onChange={(key) => {
        if (key) {
          setTheme(key.toString());
          if (isPersisted) mutate({ name: "interface", content: { theme: key.toString() } });
        }
      }}
      {...props}
    >
      {({ id, Icon }) => (
        <Select.ListBoxItem id={id} textValue={_(THEMES[id])} key={id}>
          <span className="flex flex-row items-center gap-2">
            <HugeiconsIcon className="size-5" strokeWidth={1.75} icon={Icon} aria-hidden="true" />
            <Trans id={THEMES[id].id} />
          </span>
        </Select.ListBoxItem>
      )}
    </Select>
  );
}
