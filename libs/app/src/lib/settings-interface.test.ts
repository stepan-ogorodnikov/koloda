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

  // WHY: every field is a strict z.enum over its registry keys, so all five rejections share
  // one mechanism; one invalid spelling per field pins the schema against loosening to z.string().
  it("rejects values outside any field's enum", () => {
    for (const [field, value] of [
      ["language", "fr"],
      ["scheme", "blue"],
      ["lightTheme", "solarized"],
      ["darkTheme", "solarized"],
      ["motion", "slow"],
    ] as const) {
      const result = interfaceSettingsValidation.safeParse({ [field]: value });
      expect(result.success, `${field} must reject ${value}`).toBe(false);
    }
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
