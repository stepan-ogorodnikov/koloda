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
};

export const DARK_THEMES: Record<string, string> = {
  "atom-one-dark": "Atom One Dark",
};

export type LightTheme = keyof typeof LIGHT_THEMES;
export type DarkTheme = keyof typeof DARK_THEMES;

export const MOTION_SETTINGS: Record<string, MessageDescriptor> = {
  on: msg`motion.on`,
  off: msg`motion.off`,
  system: msg`motion.system`,
};

export const interfaceSettingsValidation = z.object({
  language: z.enum(LOCALES).default("en"),
  scheme: z.enum(Object.keys(SCHEMES)).default("system"),
  lightTheme: z.enum(Object.keys(LIGHT_THEMES)).default("atom-one-light"),
  darkTheme: z.enum(Object.keys(DARK_THEMES)).default("atom-one-dark"),
  motion: z.enum(Object.keys(MOTION_SETTINGS)).default("system"),
});

export type InterfaceSettings = z.input<typeof interfaceSettingsValidation>;

export const DEFAULT_INTERFACE_SETTINGS = interfaceSettingsValidation.parse({});

export function getLanguageCode(locale: string | null) {
  if (typeof locale !== "string") return DEFAULT_LOCALE;
  const processed = (locale?.length === 2) ? locale : locale.split("-")[0];
  return LOCALES.includes(processed) ? processed : DEFAULT_LOCALE;
}
