import { DARK_THEMES, DEFAULT_INTERFACE_SETTINGS, LIGHT_THEMES } from "@koloda/app";
import { atom } from "jotai";

const THEME_KEY = "koloda-design-system-theme";

function isDarkTheme(id: string) {
  return Object.keys(DARK_THEMES).includes(id);
}

function isTheme(id: string) {
  return Object.keys(LIGHT_THEMES).includes(id) || isDarkTheme(id);
}

function readStoredTheme() {
  const id = localStorage.getItem(THEME_KEY);
  return id != null && isTheme(id) ? id : DEFAULT_INTERFACE_SETTINGS.lightTheme;
}

export const themeAtom = atom(readStoredTheme());

// INVARIANT: sets <html> the way `libs/app-react/public/theme-boot.js` does, so theme CSS selects the same way.
export function applyTheme(id: string) {
  const root = document.documentElement;
  const isDark = isDarkTheme(id);
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
  delete root.dataset.lightTheme;
  delete root.dataset.darkTheme;
  root.dataset[isDark ? "darkTheme" : "lightTheme"] = id;
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function storeTheme(id: string) {
  localStorage.setItem(THEME_KEY, id);
}
