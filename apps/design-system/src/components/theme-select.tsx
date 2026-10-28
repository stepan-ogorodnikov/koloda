import { DARK_THEMES, LIGHT_THEMES } from "@koloda/app";
import { Select } from "@koloda/ui";
import { useAtom } from "jotai";
import { themeAtom } from "../app/theme";

const sections = [
  { id: "light", title: "Light", themes: LIGHT_THEMES },
  { id: "dark", title: "Dark", themes: DARK_THEMES },
];

export function ThemeSelect() {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <Select
      aria-label="Theme"
      buttonVariants={{ style: "ghost", size: "small" }}
      popoverVariants={{ class: "min-w-48 w-[var(--trigger-width)]" }}
      value={theme}
      onChange={(key) => {
        if (key) setTheme(key.toString());
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
