import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod/v4";

export const LANGUAGES = [
  { id: "en", value: "English" },
  { id: "ru", value: "Русский" },
];

export const LOCALES = LANGUAGES.map(({ id }) => id);

export const DEFAULT_LOCALE = LOCALES[0];

export const THEMES: Record<string, MessageDescriptor> = {
  light: msg`theme.light`,
  dark: msg`theme.dark`,
  system: msg`theme.system`,
};

export type Theme = keyof typeof THEMES;

export const MOTION_SETTINGS: Record<string, MessageDescriptor> = {
  on: msg`motion.on`,
  off: msg`motion.off`,
  system: msg`motion.system`,
};

export const interfaceSettingsValidation = z.object({
  language: z.enum(LOCALES).default("en"),
  theme: z.enum(Object.keys(THEMES)).default("system"),
  motion: z.enum(Object.keys(MOTION_SETTINGS)).default("system"),
});

export type InterfaceSettings = z.input<typeof interfaceSettingsValidation>;

export const DEFAULT_INTERFACE_SETTINGS = interfaceSettingsValidation.parse({});

export function getLanguageCode(locale: string | null) {
  if (typeof locale !== "string") return DEFAULT_LOCALE;
  const processed = (locale?.length === 2) ? locale : locale.split("-")[0];
  return LOCALES.includes(processed) ? processed : DEFAULT_LOCALE;
}
