import { DARK_THEMES, LIGHT_THEMES } from "@koloda/app";
import { darkThemeAtom, lightThemeAtom, queriesAtom, schemeAtom } from "@koloda/core-react";
import { Select } from "@koloda/ui";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { activeThemeAtom } from "../app/theme";

const sections = [
  { id: "light", title: "Light", themes: LIGHT_THEMES },
  { id: "dark", title: "Dark", themes: DARK_THEMES },
];

export function ThemeSelect() {
  const theme = useAtomValue(activeThemeAtom);
  const setScheme = useSetAtom(schemeAtom);
  const setLightTheme = useSetAtom(lightThemeAtom);
  const setDarkTheme = useSetAtom(darkThemeAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(patchSettingsMutation());

  return (
    <Select
      aria-label="Theme"
      buttonVariants={{ style: "ghost", size: "small" }}
      popoverVariants={{ class: "min-w-48 w-[var(--trigger-width)]" }}
      value={theme}
      onChange={(key) => {
        if (!key) return;
        const id = key.toString();
        const isDark = id in DARK_THEMES;
        // WHY: picking a theme also picks its side, so the app shows the theme that was picked.
        const scheme = isDark ? "dark" : "light";
        setScheme(scheme);
        if (isDark) setDarkTheme(id);
        else setLightTheme(id);
        mutate({ name: "interface", content: isDark ? { scheme, darkTheme: id } : { scheme, lightTheme: id } });
      }}
    >
      {sections.map(({ id, title, themes }) => (
        <Select.ListBoxSection id={id} key={id}>
          <Select.Header>{title}</Select.Header>
          {Object.entries(themes).map(([themeId, name]) => (
            <Select.ListBoxItem id={themeId} textValue={name} key={themeId}>
              {name}
            </Select.ListBoxItem>
          ))}
        </Select.ListBoxSection>
      ))}
    </Select>
  );
}
