import { app, nativeTheme } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UI_PREFS_FILE = "ui-prefs.json";

type UiPrefsState = {
  backgroundColor?: string;
  overlayColor?: string;
  overlaySymbolColor?: string;
};

export function loadUiPrefs(): UiPrefsState {
  try {
    const raw = readFileSync(join(app.getPath("userData"), UI_PREFS_FILE), "utf-8");
    return JSON.parse(raw) as UiPrefsState;
  } catch {
    // WHY: missing or corrupted ui-prefs.json degrades to defaults; nativeTheme
    // supplies the surface colors instead.
    return {};
  }
}

export function saveUiPrefs(prefs: UiPrefsState) {
  try {
    writeFileSync(join(app.getPath("userData"), UI_PREFS_FILE), JSON.stringify({ ...loadUiPrefs(), ...prefs }));
  } catch {}
  // WHY: prefs persistence is best-effort; overlay theming must not fail the caller.
}

// WHY: with no saved prefs the window shows the default themes, GitHub Dark and GitHub Light. Twins: the defaults in
// libs/app/src/lib/settings-interface.ts, `SURFACE` in libs/app-react/public/theme-boot.js, and the titlebar colors in
// libs/ui/src/lib/styles/themes/github-*.css.
export function getDefaultSurfaceColor() {
  return nativeTheme.shouldUseDarkColors ? "#0d1117" : "#ffffff";
}

export function getDefaultSymbolColor() {
  return nativeTheme.shouldUseDarkColors ? "#f0f6fc" : "#1f2328";
}
