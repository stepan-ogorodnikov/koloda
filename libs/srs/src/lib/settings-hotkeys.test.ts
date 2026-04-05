import { describe, expect, it } from "vitest";
import { DEFAULT_HOTKEYS_SETTINGS, hotkeysSettingsValidation } from "./settings-hotkeys";

function getIssuePaths(result: ReturnType<typeof hotkeysSettingsValidation.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path);
}

describe("settings-hotkeys", () => {
  it("fills missing scopes with empty hotkey arrays", () => {
    expect(hotkeysSettingsValidation.parse({})).toEqual({
      form: {
        submit: [],
        reset: [],
      },
      ui: {
        focusNext: [],
        focusPrev: [],
        nextTab: [],
        prevTab: [],
        close: [],
      },
      navigation: {
        dashboard: [],
        decks: [],
        algorithms: [],
        templates: [],
        settings: [],
      },
      grades: {
        again: [],
        hard: [],
        normal: [],
        easy: [],
      },
    });
  });

  it("accepts the app's opinionated default hotkey preset", () => {
    expect(hotkeysSettingsValidation.parse(DEFAULT_HOTKEYS_SETTINGS)).toEqual(DEFAULT_HOTKEYS_SETTINGS);
  });

  it("reports duplicate hotkeys inside the same scope", () => {
    const result = hotkeysSettingsValidation.safeParse({
      ...structuredClone(DEFAULT_HOTKEYS_SETTINGS),
      form: {
        submit: ["Mod+S"],
        reset: ["Mod+S"],
      },
    });

    expect(result.success).toBe(false);
    expect(getIssuePaths(result)).toEqual([
      ["form", "submit", 0],
      ["form", "reset", 0],
    ]);
  });

  it("reports duplicates when a ui hotkey is reused in another scope", () => {
    const result = hotkeysSettingsValidation.safeParse({
      ...structuredClone(DEFAULT_HOTKEYS_SETTINGS),
      ui: {
        ...DEFAULT_HOTKEYS_SETTINGS.ui,
        close: ["Alt+C"],
      },
      navigation: {
        ...DEFAULT_HOTKEYS_SETTINGS.navigation,
        dashboard: ["Alt+C"],
      },
    });

    expect(result.success).toBe(false);
    expect(getIssuePaths(result)).toEqual([
      ["ui", "close", 0],
      ["navigation", "dashboard", 0],
    ]);
  });

  it("allows duplicate hotkeys across non-ui scopes", () => {
    const result = hotkeysSettingsValidation.safeParse({
      ...structuredClone(DEFAULT_HOTKEYS_SETTINGS),
      navigation: {
        ...DEFAULT_HOTKEYS_SETTINGS.navigation,
        dashboard: ["X"],
      },
      grades: {
        ...DEFAULT_HOTKEYS_SETTINGS.grades,
        again: ["X"],
      },
    });

    expect(result.success).toBe(true);
  });
});
