import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { z } from "zod";
import { FSRS_GRADES } from "./algorithms-fsrs";

export const HOTKEY_SCOPE_LABELS: Record<HotkeyScope, MessageDescriptor> = {
  form: msg`settings.hotkeys.scopes.form`,
  ui: msg`settings.hotkeys.scopes.ui`,
  navigation: msg`settings.hotkeys.scopes.navigation`,
  grades: msg`settings.hotkeys.scopes.grades`,
  ai: msg`settings.hotkeys.scopes.ai`,
} as const;

export const HOTKEYS_LABELS: HotkeysSettingsGeneric<MessageDescriptor> = {
  form: {
    submit: msg`settings.hotkeys.form.submit`,
    reset: msg`settings.hotkeys.form.reset`,
  },
  ui: {
    submit: msg`settings.hotkeys.ui.submit`,
    focusNext: msg`settings.hotkeys.ui.focus-next`,
    focusPrev: msg`settings.hotkeys.ui.focus-prev`,
    nextTab: msg`settings.hotkeys.ui.next-tab`,
    prevTab: msg`settings.hotkeys.ui.prev-tab`,
    close: msg`settings.hotkeys.ui.close`,
  },
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
  ai: {
    cancel: msg`settings.hotkeys.ai.cancel`,
    openProfilePicker: msg`settings.hotkeys.ai.open-profile-picker`,
    openModelPicker: msg`settings.hotkeys.ai.open-model-picker`,
    toggleSettings: msg`settings.hotkeys.ai.toggle-settings`,
  },
} as const;

const hotkeys = {
  form: ["submit", "reset"],
  ui: ["submit", "focusNext", "focusPrev", "nextTab", "prevTab", "close"],
  navigation: ["dashboard", "decks", "algorithms", "templates", "settings"],
  grades: ["again", "hard", "normal", "easy"],
  ai: ["cancel", "openProfilePicker", "openModelPicker", "toggleSettings"],
} as const;

type Hotkeys = typeof hotkeys;

type ScopeHotkey<T extends HotkeyScope> = Hotkeys[T][number];

export type HotkeyScope = keyof Hotkeys;

export type HotkeysSettings = z.input<typeof hotkeysSettingsValidation>;

export type HotkeyEntry = RegisterableHotkey[];

export type HotkeysSettingsGeneric<T> = {
  [K in HotkeyScope]: { [L in Hotkeys[K][number]]: T };
};

export type AppHotkeys = HotkeysSettingsGeneric<HotkeyEntry>;

const hotkeyEntry = z.array(z.string()).default([]);

function scopeSchema<T extends HotkeyScope>(scope: T) {
  const shape = Object.fromEntries(hotkeys[scope].map((key) => [key, hotkeyEntry])) as Record<
    ScopeHotkey<T>,
    typeof hotkeyEntry
  >;
  return z.object(shape);
}

function scopeDefault<T extends HotkeyScope>(scope: T) {
  return Object.fromEntries(hotkeys[scope].map((v) => [v, []])) as unknown as Record<
    ScopeHotkey<T>,
    string[]
  >;
}

export const hotkeysSettingsValidation = z.object({
  form: scopeSchema("form").default(scopeDefault("form")),
  ui: scopeSchema("ui").default(scopeDefault("ui")),
  navigation: scopeSchema("navigation").default(scopeDefault("navigation")),
  grades: scopeSchema("grades").default(scopeDefault("grades")),
  ai: scopeSchema("ai").default(scopeDefault("ai")),
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

    // validate ui scope hotkeys are unique across all scopes
    const uiHotkeys = Object.entries(data.ui).flatMap(([field, hotkeys]) =>
      hotkeys.map((hotkey) => [hotkey, field] as [string, string])
    );
    const otherScopesHotkeys = Object.entries(data)
      .filter(([scopeKey]) => scopeKey !== "ui")
      .flatMap(([scopeKey, scopeValue]) =>
        Object.entries(scopeValue).flatMap(([field, hotkeys]) =>
          hotkeys.map((hotkey) => [hotkey, scopeKey, field] as [string, string, string])
        )
      );

    const allHotkeysMap = new Map<string, Array<{ scope: string; field: string }>>();
    uiHotkeys.forEach(([hotkey, field]) => {
      allHotkeysMap.set(hotkey, [...(allHotkeysMap.get(hotkey) || []), { scope: "ui", field }]);
    });
    otherScopesHotkeys.forEach(([hotkey, scope, field]) => {
      if (allHotkeysMap.has(hotkey)) {
        allHotkeysMap.get(hotkey)!.push({ scope, field });
      }
    });

    allHotkeysMap.forEach((locations, hotkey) => {
      const hasUiScope = locations.some((loc) => loc.scope === "ui");
      if (hasUiScope && locations.length > 1) {
        locations.forEach((loc) => {
          if (loc.scope === "ui") {
            const index = data.ui[loc.field as keyof typeof data.ui].indexOf(hotkey);
            ctx.addIssue({
              code: "custom",
              message: "validation.settings-hotkeys.duplicate-keys",
              path: ["ui", loc.field, index],
            });
          } else {
            const scopeData = data[loc.scope as keyof typeof data] as Record<string, string[]>;
            const index = scopeData[loc.field].indexOf(hotkey);
            ctx.addIssue({
              code: "custom",
              message: "validation.settings-hotkeys.duplicate-keys",
              path: [loc.scope, loc.field, index],
            });
          }
        });
      }
    });
  },
);

/** Checks if all hotkeys within given scope are unique */
const areAllHotkeysUniqueInScope = (scope: HotkeysSettings[HotkeyScope]) => {
  if (!scope) return true;
  const allHotkeys = Object.values(scope).flat();
  const uniqueHotkeys = new Set(allHotkeys);
  return allHotkeys.length === uniqueHotkeys.size;
};

/** Gets the error paths for duplicate hotkeys within given scope */
const getDuplicateHotkeyPaths = (scope: HotkeysSettings[HotkeyScope]) => {
  if (!scope) return [];
  const hotkeyToLocations = new Map<string, Array<[string, number]>>();

  Object.entries(scope).forEach(([field, hotkeys]) => {
    if (!hotkeys) return;
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

export const DEFAULT_HOTKEYS_SETTINGS: HotkeysSettings = hotkeysSettingsValidation.parse({
  form: {
    submit: ["Mod+S"],
    reset: ["Mod+D"],
  },
  ui: {
    submit: ["Mod+E"],
    focusNext: ["Alt+J"],
    focusPrev: ["Alt+K"],
    nextTab: ["J"],
    prevTab: ["K"],
    close: ["Alt+C"],
  },
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
  ai: {
    cancel: ["Mod+Shift+I"],
    openProfilePicker: ["Mod+Shift+P"],
    openModelPicker: ["Mod+Shift+M"],
    toggleSettings: ["Mod+Shift+S"],
  },
});
