import { describe, expect, it } from "vitest";
import { DEFAULT_INTERFACE_SETTINGS, getLanguageCode, interfaceSettingsValidation } from "./settings-interface";

describe("interfaceSettingsValidation", () => {
  it("provides defaults when parsing an empty object", () => {
    expect(interfaceSettingsValidation.parse({})).toEqual({
      language: "en",
      scheme: "system",
      lightTheme: "github-light",
      darkTheme: "github-dark",
      motion: "system",
    });
  });

  it("accepts valid explicit values", () => {
    const result = interfaceSettingsValidation.parse({
      language: "ru",
      scheme: "dark",
      lightTheme: "atom-one-light",
      darkTheme: "atom-one-dark",
      motion: "off",
    });
    expect(result).toEqual({
      language: "ru",
      scheme: "dark",
      lightTheme: "atom-one-light",
      darkTheme: "atom-one-dark",
      motion: "off",
    });
  });

  // WHY: every field is a strict z.enum over its registry keys; one invalid spelling per field
  // pins the schema against loosening to z.string() and mirrors Rust error codes.
  it.each([
    ["language", "fr", "validation.settings-interface.language"],
    ["scheme", "blue", "validation.settings-interface.scheme"],
    ["lightTheme", "solarized", "validation.settings-interface.light-theme"],
    ["darkTheme", "solarized", "validation.settings-interface.dark-theme"],
    ["motion", "slow", "validation.settings-interface.motion"],
  ] as const)("rejects invalid %s with %s", (field, value, code) => {
    const result = interfaceSettingsValidation.safeParse({ [field]: value });
    expect(result.success, `${field} must reject ${value}`).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(code);
  });

  it("DEFAULT_INTERFACE_SETTINGS matches parse({})", () => {
    expect(DEFAULT_INTERFACE_SETTINGS).toEqual(interfaceSettingsValidation.parse({}));
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
