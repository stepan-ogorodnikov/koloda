import { DARK_THEMES, LIGHT_THEMES } from "@koloda/app";
import { darkThemeAtom, lightThemeAtom } from "@koloda/core-react";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import type { PrimitiveAtom } from "jotai";
import type { ReactNode } from "react";
import { useInterfaceSettingWrite } from "./use-interface-setting-write";

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
  const value = useAtomValue(atom);
  const write = useInterfaceSettingWrite();
  const items = Object.entries(themes).map(([id, name]) => ({ id, name }));

  return (
    <Select
      popoverVariants={{ class: "min-w-48 w-[var(--trigger-width)]" }}
      label={label}
      aria-label={!label ? _(ariaLabel) : undefined}
      items={items}
      value={value}
      onChange={(key) => {
        if (key) write(field, key.toString());
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

type ThemePickerProps = Partial<SelectProps<{ id: string }>>;

export function LightThemePicker(props: ThemePickerProps) {
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

export function DarkThemePicker(props: ThemePickerProps) {
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
