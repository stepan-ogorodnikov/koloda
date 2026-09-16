import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { z } from "zod";

export const HOTKEY_CATEGORY_LABELS: Record<HotkeyCategory, MessageDescriptor> = {
  form: msg`settings.hotkeys.categories.form`,
  ui: msg`settings.hotkeys.categories.ui`,
  navigation: msg`settings.hotkeys.categories.navigation`,
  grades: msg`settings.hotkeys.categories.grades`,
  ai: msg`settings.hotkeys.categories.ai`,
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
    toggleSidebarControls: msg`settings.hotkeys.ui.toggle-sidebar-controls`,
    toggleColorScheme: msg`settings.hotkeys.ui.toggle-color-scheme`,
  },
  navigation: {
    dashboard: msg`settings.hotkeys.navigation.dashboard`,
    decks: msg`settings.hotkeys.navigation.decks`,
    algorithms: msg`settings.hotkeys.navigation.algorithms`,
    templates: msg`settings.hotkeys.navigation.templates`,
    ai: msg`settings.hotkeys.navigation.ai`,
    settings: msg`settings.hotkeys.navigation.settings`,
  },
  grades: {
    again: msg`settings.hotkeys.grades.again`,
    hard: msg`settings.hotkeys.grades.hard`,
    normal: msg`settings.hotkeys.grades.normal`,
    easy: msg`settings.hotkeys.grades.easy`,
  },
  ai: {
    cancel: msg`settings.hotkeys.ai.cancel`,
    focusPrompt: msg`settings.hotkeys.ai.focus-prompt`,
    newConversation: msg`settings.hotkeys.ai.new-conversation`,
    openModelPicker: msg`settings.hotkeys.ai.open-model-picker`,
    toggleSettings: msg`settings.hotkeys.ai.toggle-settings`,
    previousConversation: msg`settings.hotkeys.ai.previous-conversation`,
    nextConversation: msg`settings.hotkeys.ai.next-conversation`,
    scrollUp: msg`settings.hotkeys.ai.scroll-up`,
    scrollDown: msg`settings.hotkeys.ai.scroll-down`,
    scrollToTop: msg`settings.hotkeys.ai.scroll-to-top`,
    scrollToBottom: msg`settings.hotkeys.ai.scroll-to-bottom`,
  },
} as const;

const hotkeys = {
  form: ["submit", "reset"],
  ui: ["submit", "focusNext", "focusPrev", "nextTab", "prevTab", "close", "toggleSidebarControls", "toggleColorScheme"],
  navigation: ["dashboard", "decks", "algorithms", "templates", "settings", "ai"],
  grades: ["again", "hard", "normal", "easy"],
  ai: [
    "cancel",
    "focusPrompt",
    "newConversation",
    "openModelPicker",
    "previousConversation",
    "nextConversation",
    "toggleSettings",
    "scrollUp",
    "scrollDown",
    "scrollToTop",
    "scrollToBottom",
  ],
} as const;

type Hotkeys = typeof hotkeys;

type CategoryHotkey<T extends HotkeyCategory> = Hotkeys[T][number];

export type HotkeyCategory = keyof Hotkeys;

export type HotkeysSettings = z.input<typeof hotkeysSettingsValidation>;

export type HotkeyEntry = RegisterableHotkey[];

export type HotkeysSettingsGeneric<T> = {
  [K in HotkeyCategory]: { [L in Hotkeys[K][number]]: T };
};

export type AppHotkeys = HotkeysSettingsGeneric<HotkeyEntry>;

const hotkeyEntry = z.array(z.string()).default([]);

function categorySchema<T extends HotkeyCategory>(category: T) {
  const shape = Object.fromEntries(hotkeys[category].map((key) => [key, hotkeyEntry])) as Record<
    CategoryHotkey<T>,
    typeof hotkeyEntry
  >;
  return z.object(shape);
}

function categoryDefault<T extends HotkeyCategory>(category: T) {
  return Object.fromEntries(hotkeys[category].map((v) => [v, []])) as unknown as Record<CategoryHotkey<T>, string[]>;
}

export const hotkeysSettingsValidation = z
  .object({
    form: categorySchema("form").default(categoryDefault("form")),
    ui: categorySchema("ui").default(categoryDefault("ui")),
    navigation: categorySchema("navigation").default(categoryDefault("navigation")),
    grades: categorySchema("grades").default(categoryDefault("grades")),
    ai: categorySchema("ai").default(categoryDefault("ai")),
  })
  .superRefine((data, ctx) => {
    Object.entries(data).forEach(([categoryKey, categoryValue]) => {
      if (!areAllHotkeysUniqueInCategory(categoryValue)) {
        getDuplicateHotkeyPaths(categoryValue).forEach(([field, index]) => {
          ctx.addIssue({
            code: "custom",
            message: "validation.settings-hotkeys.duplicate-keys",
            path: [categoryKey, field, index],
          });
        });
      }
    });

    const uiHotkeys = Object.entries(data.ui).flatMap(([field, hotkeys]) =>
      hotkeys.map((hotkey) => [hotkey, field] as [string, string]),
    );
    const otherCategoriesHotkeys = Object.entries(data)
      .filter(([categoryKey]) => categoryKey !== "ui")
      .flatMap(([categoryKey, categoryValue]) =>
        Object.entries(categoryValue).flatMap(([field, hotkeys]) =>
          hotkeys.map((hotkey) => [hotkey, categoryKey, field] as [string, string, string]),
        ),
      );

    const allHotkeysMap = new Map<string, Array<{ category: string; field: string }>>();
    uiHotkeys.forEach(([hotkey, field]) => {
      allHotkeysMap.set(hotkey, [...(allHotkeysMap.get(hotkey) || []), { category: "ui", field }]);
    });
    otherCategoriesHotkeys.forEach(([hotkey, category, field]) => {
      if (allHotkeysMap.has(hotkey)) {
        allHotkeysMap.get(hotkey)!.push({ category, field });
      }
    });

    allHotkeysMap.forEach((locations, hotkey) => {
      const hasUiCategory = locations.some((loc) => loc.category === "ui");
      if (hasUiCategory && locations.length > 1) {
        locations.forEach((loc) => {
          if (loc.category === "ui") {
            const index = data.ui[loc.field as keyof typeof data.ui].indexOf(hotkey);
            ctx.addIssue({
              code: "custom",
              message: "validation.settings-hotkeys.duplicate-keys",
              path: ["ui", loc.field, index],
            });
          } else {
            const categoryData = data[loc.category as keyof typeof data] as Record<string, string[]>;
            const index = categoryData[loc.field].indexOf(hotkey);
            ctx.addIssue({
              code: "custom",
              message: "validation.settings-hotkeys.duplicate-keys",
              path: [loc.category, loc.field, index],
            });
          }
        });
      }
    });
  });

const areAllHotkeysUniqueInCategory = (category: HotkeysSettings[HotkeyCategory]) => {
  if (!category) return true;
  const allHotkeys = Object.values(category).flat();
  const uniqueHotkeys = new Set(allHotkeys);
  return allHotkeys.length === uniqueHotkeys.size;
};

const getDuplicateHotkeyPaths = (category: HotkeysSettings[HotkeyCategory]) => {
  if (!category) return [];
  const hotkeyToLocations = new Map<string, Array<[string, number]>>();

  Object.entries(category).forEach(([field, hotkeys]) => {
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
    toggleSidebarControls: ["Mod+B"],
    toggleColorScheme: [],
  },
  navigation: {
    dashboard: ["H"],
    decks: ["D"],
    algorithms: ["P"],
    templates: ["T"],
    settings: ["Mod+,"],
    ai: ["A"],
  },
  grades: {
    again: ["1"],
    hard: ["2"],
    normal: ["3"],
    easy: ["4"],
  },
  ai: {
    cancel: ["Mod+Shift+I"],
    focusPrompt: ["Mod+L"],
    newConversation: [],
    openModelPicker: ["Mod+Shift+M"],
    previousConversation: [],
    nextConversation: [],
    toggleSettings: ["Mod+Shift+S"],
    scrollUp: [],
    scrollDown: [],
    scrollToTop: [],
    scrollToBottom: [],
  },
});
