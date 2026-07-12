import { DARK_THEMES, LIGHT_THEMES } from "@koloda/app";
import { darkThemeAtom, lightThemeAtom, queriesAtom } from "@koloda/core-react";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import type { PrimitiveAtom } from "jotai";
import type { ReactNode } from "react";

type ThemeMap = Record<string, string>;

type ColorThemePickerProps = Partial<SelectProps<{ id: string }>> & {
  themes: ThemeMap;
  atom: PrimitiveAtom<string>;
  field: "lightTheme" | "darkTheme";
  label: ReactNode;
  ariaLabel: MessageDescriptor;
};

function ColorThemePicker({ themes, atom, field, label, ariaLabel, ...props }: ColorThemePickerProps) {
  const { _ } = useLingui();
  const [value, setValue] = useAtom(atom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(patchSettingsMutation());
  const items = Object.entries(themes).map(([id, name]) => ({ id, name }));

  return (
    <Select
      popoverVariants={{ class: "min-w-48" }}
      label={label}
      aria-label={!label ? _(ariaLabel) : undefined}
      items={items}
      value={value}
      onChange={(key) => {
        if (key) {
          const next = key.toString();
          setValue(next);
          mutate({ name: "interface", content: { [field]: next } });
        }
      }}
      {...props}
    >
      {items.map(({ id, name }) => (
        <Select.ListBoxItem id={id} textValue={name} key={id}>
          {name}
        </Select.ListBoxItem>
      ))}
    </Select>
  );
}

export function LightThemePicker(props: Partial<SelectProps<{ id: string }>>) {
  const { _ } = useLingui();

  return (
    <ColorThemePicker
      themes={LIGHT_THEMES}
      atom={lightThemeAtom}
      field="lightTheme"
      label={_(msg`settings.interface.light-theme`)}
      ariaLabel={msg`light-theme-picker.label`}
      {...props}
    />
  );
}

export function DarkThemePicker(props: Partial<SelectProps<{ id: string }>>) {
  const { _ } = useLingui();

  return (
    <ColorThemePicker
      themes={DARK_THEMES}
      atom={darkThemeAtom}
      field="darkTheme"
      label={_(msg`settings.interface.dark-theme`)}
      ariaLabel={msg`dark-theme-picker.label`}
      {...props}
    />
  );
}
