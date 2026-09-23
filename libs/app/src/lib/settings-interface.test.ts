import { describe, expect, it } from "vitest";
import { getLanguageCode, interfaceSettingsValidation } from "./settings-interface";

describe("interfaceSettingsValidation", () => {
  it("provides defaults when parsing an empty object", () => {
    expect(interfaceSettingsValidation.parse({})).toEqual({
      language: "en",
      scheme: "system",
      lightTheme: "github-light",
      darkTheme: "github-dark",
      motion: "system",
      dateFormat: "locale",
      timeFormat: "locale",
    });
  });

  it("accepts valid explicit values", () => {
    const result = interfaceSettingsValidation.parse({
      language: "ru",
      scheme: "dark",
      lightTheme: "atom-one-light",
      darkTheme: "atom-one-dark",
      motion: "off",
      dateFormat: "dd.MM.yyyy",
      timeFormat: "HH:mm",
    });
    expect(result).toEqual({
      language: "ru",
      scheme: "dark",
      lightTheme: "atom-one-light",
      darkTheme: "atom-one-dark",
      motion: "off",
      dateFormat: "dd.MM.yyyy",
      timeFormat: "HH:mm",
    });
  });

  // WHY: enum fields pin against loosening to z.string(); the pattern fields pin the four
  // structural rejects (empty, unescaped letter, over-cap, literal-only) that the Rust
  // mirror enforces with the same codes, so every rejection row has a twin in
  // `crates/koloda/tests/domain/settings_interface_tests.rs`.
  const OVER_LONG_PATTERN = "y".repeat(65);
  it.each([
    ["language", "fr", "validation.settings-interface.language"],
    ["scheme", "blue", "validation.settings-interface.scheme"],
    ["lightTheme", "solarized", "validation.settings-interface.light-theme"],
    ["darkTheme", "solarized", "validation.settings-interface.dark-theme"],
    ["motion", "slow", "validation.settings-interface.motion"],
    ["dateFormat", "", "validation.settings-interface.date-format"],
    ["dateFormat", "hello", "validation.settings-interface.date-format"],
    ["dateFormat", OVER_LONG_PATTERN, "validation.settings-interface.date-format"],
    ["dateFormat", "'noon'", "validation.settings-interface.date-format"],
    ["timeFormat", "", "validation.settings-interface.time-format"],
    ["timeFormat", "hello", "validation.settings-interface.time-format"],
    ["timeFormat", OVER_LONG_PATTERN, "validation.settings-interface.time-format"],
    ["timeFormat", "'noon'", "validation.settings-interface.time-format"],
  ] as const)("rejects invalid %s with %s", (field, value, code) => {
    const result = interfaceSettingsValidation.safeParse({ [field]: value });
    expect(result.success, `${field} must reject ${value}`).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(code);
  });
});

describe("getLanguageCode", () => {
  it("echoes a supported locale", () => {
    expect(getLanguageCode("ru")).toBe("ru");
  });

  it("strips region from en-US", () => {
    expect(getLanguageCode("en-US")).toBe("en");
  });

  it("falls back to en for unsupported fr", () => {
    expect(getLanguageCode("fr")).toBe("en");
  });

  it("strips region and falls back for unsupported zh-CN", () => {
    expect(getLanguageCode("zh-CN")).toBe("en");
  });

  it("falls back to en for null", () => {
    expect(getLanguageCode(null)).toBe("en");
  });
});
