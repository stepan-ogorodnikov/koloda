export const UI_PREFERENCES_STORAGE_KEY = "koloda-ui-prefs";

export type UiPreferencesCache = {
  scheme?: string;
  lightTheme?: string;
  darkTheme?: string;
  motion?: string;
};

export function readUiPreferencesCache(): UiPreferencesCache | null {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    return parsed as UiPreferencesCache;
  } catch {
    return null;
  }
}

export function writeUiPreferencesCache(prefs: UiPreferencesCache) {
  try {
    const current = readUiPreferencesCache() ?? {};
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {
    // ignore quota / private mode
  }
}
