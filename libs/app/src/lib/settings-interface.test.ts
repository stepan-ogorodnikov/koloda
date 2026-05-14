import { describe, expect, it } from "vitest";
import { DEFAULT_INTERFACE_SETTINGS, getLanguageCode, interfaceSettingsValidation } from "./settings-interface";

describe("interfaceSettingsValidation", () => {
  it("provides defaults when parsing an empty object", () => {
    expect(interfaceSettingsValidation.parse({})).toEqual({
      language: "en",
      theme: "system",
      motion: "system",
    });
  });

  it("accepts valid explicit values", () => {
    const result = interfaceSettingsValidation.parse({
      language: "ru",
      theme: "dark",
      motion: "off",
    });
    expect(result).toEqual({
      language: "ru",
      theme: "dark",
      motion: "off",
    });
  });

  it("rejects invalid language", () => {
    const result = interfaceSettingsValidation.safeParse({ language: "fr" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid theme", () => {
    const result = interfaceSettingsValidation.safeParse({ theme: "blue" });
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
