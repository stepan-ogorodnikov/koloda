import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

export const LANGUAGES = [
  { id: "en", value: "English" },
  { id: "ru", value: "Русский" },
];

export const LOCALES = LANGUAGES.map(({ id }) => id);

export const DEFAULT_LOCALE = LOCALES[0];

export const SCHEMES: Record<string, MessageDescriptor> = {
  light: msg`scheme.light`,
  dark: msg`scheme.dark`,
  system: msg`scheme.system`,
};

export type Scheme = keyof typeof SCHEMES;

export const LIGHT_THEMES: Record<string, string> = {
  "atom-one-light": "Atom One Light",
  "github-light": "GitHub Light",
};

export const DARK_THEMES: Record<string, string> = {
  "atom-one-dark": "Atom One Dark",
  "github-dark": "GitHub Dark",
};

export type LightTheme = keyof typeof LIGHT_THEMES;
export type DarkTheme = keyof typeof DARK_THEMES;

export const MOTION_SETTINGS: Record<string, MessageDescriptor> = {
  on: msg`motion.on`,
  off: msg`motion.off`,
  system: msg`motion.system`,
};

const SCHEME_KEYS = Object.keys(SCHEMES) as [Scheme, ...Scheme[]];
const LIGHT_THEME_KEYS = Object.keys(LIGHT_THEMES) as [LightTheme, ...LightTheme[]];
const DARK_THEME_KEYS = Object.keys(DARK_THEMES) as [DarkTheme, ...DarkTheme[]];
const MOTION_KEYS = Object.keys(MOTION_SETTINGS) as [
  keyof typeof MOTION_SETTINGS,
  ...Array<keyof typeof MOTION_SETTINGS>,
];

export const interfaceSettingsValidation = z.object({
  language: z.enum(LOCALES, { message: "validation.settings-interface.language" }).default("en"),
  scheme: z.enum(SCHEME_KEYS, { message: "validation.settings-interface.scheme" }).default("system"),
  lightTheme: z
    .enum(LIGHT_THEME_KEYS, { message: "validation.settings-interface.light-theme" })
    .default("github-light"),
  darkTheme: z.enum(DARK_THEME_KEYS, { message: "validation.settings-interface.dark-theme" }).default("github-dark"),
  motion: z.enum(MOTION_KEYS, { message: "validation.settings-interface.motion" }).default("system"),
});

export type InterfaceSettings = z.input<typeof interfaceSettingsValidation>;

export const DEFAULT_INTERFACE_SETTINGS = interfaceSettingsValidation.parse({});

export function getLanguageCode(locale: string | null) {
  if (typeof locale !== "string") return DEFAULT_LOCALE;
  const processed = locale?.length === 2 ? locale : locale.split("-")[0];
  return LOCALES.includes(processed) ? processed : DEFAULT_LOCALE;
}
