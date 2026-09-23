import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { format } from "date-fns";
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

const LATIN_LETTER = /[a-z]/i;
const TIMESTAMP_PATTERN_MAX_LENGTH = 64;
const TIMESTAMP_PATTERN_TOKENS = new Set(["y", "M", "d", "H", "h", "m", "s", "a"]);

// WHY: this scan must stay in step with the Rust mirror (`is_valid_timestamp_pattern` in
// `settings_interface.rs`) — both hosts enforce the same letter whitelist, quote rules,
// and length cap without a pattern engine, while the final date-fns probe here is
// TS-only (it catches what structure cannot, e.g. protected tokens). "locale" is the
// sentinel, not a pattern, so it bypasses both checks. date-fns escapes literals with
// single quotes (`'at'`, `''` for a real quote), so letters inside quotes never count
// as tokens.
function isValidTimestampPattern(value: string): boolean {
  if (value === "locale") return true;
  const characters = [...value];
  if (characters.length === 0 || characters.length > TIMESTAMP_PATTERN_MAX_LENGTH) return false;

  let inQuote = false;
  let tokenCount = 0;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === "'") {
      if (characters[index + 1] === "'") {
        index += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (LATIN_LETTER.test(character)) {
      if (!TIMESTAMP_PATTERN_TOKENS.has(character)) return false;
      tokenCount += 1;
    }
  }
  if (tokenCount === 0) return false;

  try {
    format(new Date(2000, 0, 1, 12, 30, 45), value);
    return true;
  } catch {
    return false;
  }
}

export const interfaceSettingsValidation = z.object({
  language: z.enum(LOCALES, { message: "validation.settings-interface.language" }).default("en"),
  scheme: z.enum(SCHEME_KEYS, { message: "validation.settings-interface.scheme" }).default("system"),
  lightTheme: z
    .enum(LIGHT_THEME_KEYS, { message: "validation.settings-interface.light-theme" })
    .default("github-light"),
  darkTheme: z.enum(DARK_THEME_KEYS, { message: "validation.settings-interface.dark-theme" }).default("github-dark"),
  motion: z.enum(MOTION_KEYS, { message: "validation.settings-interface.motion" }).default("system"),
  dateFormat: z
    .string({ message: "validation.settings-interface.date-format" })
    .refine(isValidTimestampPattern, { message: "validation.settings-interface.date-format" })
    .default("locale"),
  timeFormat: z
    .string({ message: "validation.settings-interface.time-format" })
    .refine(isValidTimestampPattern, { message: "validation.settings-interface.time-format" })
    .default("locale"),
});

export type InterfaceSettings = z.input<typeof interfaceSettingsValidation>;

export const DEFAULT_INTERFACE_SETTINGS = interfaceSettingsValidation.parse({});

export function getLanguageCode(locale: string | null) {
  if (typeof locale !== "string") return DEFAULT_LOCALE;
  const processed = locale?.length === 2 ? locale : locale.split("-")[0];
  return LOCALES.includes(processed) ? processed : DEFAULT_LOCALE;
}
