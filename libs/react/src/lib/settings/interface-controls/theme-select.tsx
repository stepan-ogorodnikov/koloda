import { queriesAtom } from "@koloda/react";
import { themeAtom } from "@koloda/react";
import { THEMES } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { Monitor, Moon, Sun } from "lucide-react";

const ITEMS = [
  { id: "light", Icon: Sun },
  { id: "dark", Icon: Moon },
  { id: "system", Icon: Monitor },
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
            <Icon className="size-5" />
            <Trans id={THEMES[id].id} />
          </span>
        </Select.ListBoxItem>
      )}
    </Select>
  );
}
