import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { z } from "zod";
import { FSRS_GRADES } from "./algorithms-fsrs";

export const HOTKEY_SCOPE_LABELS: Record<HotkeyScope, MessageDescriptor> = {
  navigation: msg`settings.hotkeys.scopes.navigation`,
  grades: msg`settings.hotkeys.scopes.grades`,
} as const;

export const HOTKEYS_LABELS = {
  navigation: {
    dashboard: msg`settings.hotkeys.navigation.dashboard`,
    decks: msg`settings.hotkeys.navigation.decks`,
    algorithms: msg`settings.hotkeys.navigation.algorithms`,
    templates: msg`settings.hotkeys.navigation.templates`,
    settings: msg`settings.hotkeys.navigation.settings`,
  },
  grades: {
    again: FSRS_GRADES[0],
    hard: FSRS_GRADES[1],
    normal: FSRS_GRADES[2],
    easy: FSRS_GRADES[3],
  },
} as const;

const HotkeyEntry = z.array(z.string());

export const hotkeysSettingsValidation = z.object({
  navigation: z.record(z.literal(["dashboard", "decks", "algorithms", "templates", "settings"]), HotkeyEntry),
  grades: z.record(z.literal(["again", "hard", "normal", "easy"]), HotkeyEntry),
}).superRefine(
  (data, ctx) => {
    // validate all scopes for duplicate hotkeys (within each scope)
    Object.entries(data).forEach(([scopeKey, scopeValue]) => {
      if (!areAllHotkeysUniqueInScope(scopeValue)) {
        getDuplicateHotkeyPaths(scopeValue).forEach(([field, index]) => {
          ctx.addIssue({
            code: "custom",
            message: "validation.settings-hotkeys.duplicate-keys",
            path: [scopeKey, field, index],
          });
        });
      }
    });
  },
);

/** Checks if all hotkeys within given scope are unique */
const areAllHotkeysUniqueInScope = (scope: HotkeysSettings[HotkeyScope]) => {
  const allHotkeys = Object.values(scope).flat();
  const uniqueHotkeys = new Set(allHotkeys);
  return allHotkeys.length === uniqueHotkeys.size;
};

/** Gets the error paths for duplicate hotkeys within given scope */
const getDuplicateHotkeyPaths = (scope: HotkeysSettings[HotkeyScope]) => {
  const hotkeyToLocations = new Map<string, Array<[string, number]>>();

  Object.entries(scope).forEach(([field, hotkeys]) => {
    hotkeys.forEach((hotkey, index) => {
      if (!hotkeyToLocations.has(hotkey)) hotkeyToLocations.set(hotkey, []);
      hotkeyToLocations.get(hotkey)!.push([field, index]);
    });
  });

  const duplicates: Array<[string, number]> = [];
  hotkeyToLocations.forEach((locations, _hotkey) => {
    if (locations.length > 1) duplicates.push(...locations);
  });

  return duplicates;
};

export type HotkeysSettings = z.input<typeof hotkeysSettingsValidation>;
export type HotkeyScope = keyof HotkeysSettings;
export type HotkeyEntry = RegisterableHotkey[];

export type AppHotkeys = {
  [K in HotkeyScope]: {
    [L in keyof HotkeysSettings[K]]: HotkeyEntry;
  };
};

export const DEFAULT_HOTKEYS_SETTINGS: HotkeysSettings = hotkeysSettingsValidation.parse({
  navigation: {
    dashboard: ["H"],
    decks: ["D"],
    algorithms: ["P"],
    templates: ["T"],
    settings: ["Mod+,"],
  },
  grades: {
    again: ["1"],
    hard: ["2"],
    normal: ["3"],
    easy: ["4"],
  },
});
