import { describe, expect, it } from "vitest";
import { DEFAULT_INTERFACE_SETTINGS, getLanguageCode, interfaceSettingsValidation } from "./settings-interface";

describe("interfaceSettingsValidation", () => {
  it("provides defaults when parsing an empty object", () => {
    expect(interfaceSettingsValidation.parse({})).toEqual({
      language: "en",
      scheme: "system",
      lightTheme: "atom-one-light",
      darkTheme: "atom-one-dark",
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

  it("rejects invalid language", () => {
    const result = interfaceSettingsValidation.safeParse({ language: "fr" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid scheme", () => {
    const result = interfaceSettingsValidation.safeParse({ scheme: "blue" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid light theme", () => {
    const result = interfaceSettingsValidation.safeParse({ lightTheme: "solarized" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid dark theme", () => {
    const result = interfaceSettingsValidation.safeParse({ darkTheme: "solarized" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid motion", () => {
    const result = interfaceSettingsValidation.safeParse({ motion: "slow" });
    expect(result.success).toBe(false);
  });

  it("DEFAULT_INTERFACE_SETTINGS matches parse({})", () => {
    expect(DEFAULT_INTERFACE_SETTINGS).toEqual(interfaceSettingsValidation.parse({}));
  });
});

describe("getLanguageCode", () => {
  it("returns en for en", () => {
    expect(getLanguageCode("en")).toBe("en");
  });

  it("returns ru for ru", () => {
    expect(getLanguageCode("ru")).toBe("ru");
  });

  it("strips region from en-US", () => {
    expect(getLanguageCode("en-US")).toBe("en");
  });

  it("strips region from ru-RU", () => {
    expect(getLanguageCode("ru-RU")).toBe("ru");
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

  it("falls back to en for empty string", () => {
    expect(getLanguageCode("")).toBe("en");
  });

  it("falls back to en for undefined", () => {
    expect(getLanguageCode(undefined as any)).toBe("en");
  });
});
