import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DARK_THEMES,
  DEFAULT_INTERFACE_SETTINGS,
  LANGUAGES,
  LIGHT_THEMES,
  MOTION_SETTINGS,
  SCHEMES,
} from "./settings-interface";

// INVARIANT: TS↔Rust twin (agents/TESTING.md) — the interface registries and defaults are written by hand in
// `settings-interface.ts` and `crates/koloda/src/domain/settings_interface.rs`, and each theme's surface color in its
// CSS file and in `theme-boot.js`. This test parses the other sources at test time (no pinned copy), so a theme or
// value added on one side only fails here instead of being rejected silently on the desktop.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const RUST_SETTINGS_INTERFACE = readFileSync(resolve(ROOT, "crates/koloda/src/domain/settings_interface.rs"), "utf8");
const THEME_BOOT = readFileSync(resolve(ROOT, "libs/app-react/public/theme-boot.js"), "utf8");
const THEMES_DIR = resolve(ROOT, "libs/ui/src/lib/styles/themes");

function rustList(name: string): string[] {
  const match = RUST_SETTINGS_INTERFACE.match(new RegExp(`pub const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\];`));
  if (!match) throw new Error(`${name} not found in settings_interface.rs`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((value) => value[1]);
}

function rustDefault(name: string): string {
  const match = RUST_SETTINGS_INTERFACE.match(new RegExp(`fn default_${name}\\(\\) -> String \\{\\s*"([^"]+)"`));
  if (!match) throw new Error(`default_${name} not found in settings_interface.rs`);
  return match[1];
}

function bootFallback(name: string): string {
  const match = THEME_BOOT.match(new RegExp(`var ${name} = prefs\\.${name} \\|\\| "([^"]+)";`));
  if (!match) throw new Error(`${name} fallback not found in theme-boot.js`);
  return match[1];
}

function bootSurfaces(): Record<string, string> {
  const block = THEME_BOOT.match(/var SURFACE = \{([^}]*)\}/);
  if (!block) throw new Error("SURFACE not found in theme-boot.js");
  return Object.fromEntries([...block[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((entry) => [entry[1], entry[2]]));
}

function themeToken(id: string, token: string): string {
  const css = readFileSync(resolve(THEMES_DIR, `${id}.css`), "utf8");
  const match = css.match(new RegExp(`${token}:\\s*([^;]+);`));
  if (!match) throw new Error(`${token} not found in ${id}.css`);
  return match[1].trim();
}

const THEME_IDS = [...Object.keys(LIGHT_THEMES), ...Object.keys(DARK_THEMES)];

describe("interface settings parity", () => {
  it.each([
    ["LANGUAGES", LANGUAGES.map(({ id }) => id)],
    ["SCHEMES", Object.keys(SCHEMES)],
    ["LIGHT_THEMES", Object.keys(LIGHT_THEMES)],
    ["DARK_THEMES", Object.keys(DARK_THEMES)],
    ["MOTION_SETTINGS", Object.keys(MOTION_SETTINGS)],
  ])("registers the same %s as Rust", (name, values) => {
    expect([...values].sort()).toEqual(rustList(name).sort());
  });

  it("defaults every field the same as Rust", () => {
    expect(DEFAULT_INTERFACE_SETTINGS).toEqual({
      language: rustDefault("language"),
      scheme: rustDefault("scheme"),
      lightTheme: rustDefault("light_theme"),
      darkTheme: rustDefault("dark_theme"),
      motion: rustDefault("motion"),
      dateFormat: rustDefault("date_format"),
      timeFormat: rustDefault("time_format"),
    });
  });

  it("falls back to the default look in theme-boot.js", () => {
    const { scheme, lightTheme, darkTheme, motion } = DEFAULT_INTERFACE_SETTINGS;
    expect({
      scheme: bootFallback("scheme"),
      lightTheme: bootFallback("lightTheme"),
      darkTheme: bootFallback("darkTheme"),
      motion: bootFallback("motion"),
    }).toEqual({ scheme, lightTheme, darkTheme, motion });
  });

  it("lists every registered theme in theme-boot.js SURFACE, and no other", () => {
    expect(Object.keys(bootSurfaces()).sort()).toEqual([...THEME_IDS].sort());
  });

  it.each(THEME_IDS)("paints %s with one surface color in its CSS, its titlebar, and SURFACE", (id) => {
    const surface = themeToken(id, "--color-bg");
    expect(themeToken(id, "--titlebar-overlay-color")).toBe(surface);
    expect(bootSurfaces()[id]).toBe(surface);
  });
});
