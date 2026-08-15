import { describe, expect, it } from "vitest";
import { getDemoBrowserSupport, isChromiumBased } from "./browser-support";

const wasm = { instantiate: () => undefined };
const indexedDb = {};

describe("isChromiumBased", () => {
  it("detects Chromium from user agent client hints", () => {
    expect(
      isChromiumBased({
        userAgent: "Mozilla/5.0",
        userAgentData: { brands: [{ brand: "Not A;Brand" }, { brand: "Chromium" }, { brand: "Google Chrome" }] },
      }),
    ).toBe(true);
  });

  it("rejects non-Chromium client hints", () => {
    expect(
      isChromiumBased({
        userAgent: "Mozilla/5.0",
        userAgentData: { brands: [{ brand: "Firefox" }] },
      }),
    ).toBe(false);
  });

  it("detects Chromium from the user agent when client hints are missing", () => {
    expect(
      isChromiumBased({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      }),
    ).toBe(true);
  });

  it("treats iOS Chrome as non-Chromium", () => {
    expect(
      isChromiumBased({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(false);
  });

  it("rejects Firefox and Safari user agents", () => {
    expect(
      isChromiumBased({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
      }),
    ).toBe(false);
    expect(
      isChromiumBased({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      }),
    ).toBe(false);
  });
});

describe("getDemoBrowserSupport", () => {
  it("can run when IndexedDB and WebAssembly are available", () => {
    expect(
      getDemoBrowserSupport({ userAgent: "Mozilla/5.0 Firefox/128.0" }, { indexedDB: indexedDb, WebAssembly: wasm }),
    ).toEqual({
      hasIndexedDb: true,
      hasWasm: true,
      canRun: true,
      isChromiumBased: false,
    });
  });

  it("cannot run when IndexedDB is missing", () => {
    expect(getDemoBrowserSupport({ userAgent: "Mozilla/5.0 Chrome/128.0" }, { WebAssembly: wasm }).canRun).toBe(false);
  });
});
