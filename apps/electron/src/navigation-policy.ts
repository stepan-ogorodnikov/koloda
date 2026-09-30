import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// WHY: Dev loads this origin (`apps/electron-react` vite `server.host` / `server.port`).
// Packaged loads `electron-react/index.html` via `loadFile`. Hash changes stay in the
// page and do not count as a navigation.
export const DEV_APP_ORIGIN = "http://localhost:3000";

export const UNTRUSTED_FRAME_MESSAGE = "Rejected IPC from an untrusted frame";

export type AppNavigationTarget = { kind: "dev"; origin: string } | { kind: "file"; indexPath: string };

export type NavigationDecision = { action: "allow" } | { action: "open-external"; url: string } | { action: "deny" };

export function appNavigationTarget(input: { isDev: boolean; appDir: string }): AppNavigationTarget {
  if (input.isDev) return { kind: "dev", origin: DEV_APP_ORIGIN };
  return { kind: "file", indexPath: join(input.appDir, "../electron-react/index.html") };
}

export function decideNavigation(raw: string, target: AppNavigationTarget): NavigationDecision {
  if (isAppUrl(raw, target)) return { action: "allow" };
  const external = externalHttpUrl(raw);
  if (external != null) return { action: "open-external", url: external };
  return { action: "deny" };
}

export function assertAppFrame(frameUrl: string | undefined, target: AppNavigationTarget): void {
  if (frameUrl == null || !isAppUrl(frameUrl, target)) {
    throw new Error(UNTRUSTED_FRAME_MESSAGE);
  }
}

function isAppUrl(raw: string, target: AppNavigationTarget): boolean {
  const url = parseUrl(raw);
  if (url == null) return false;
  if (target.kind === "dev") return url.origin === target.origin;
  if (url.protocol !== "file:") return false;
  try {
    return samePath(fileURLToPath(url), target.indexPath);
  } catch {
    return false;
  }
}

function externalHttpUrl(raw: string): string | null {
  const url = parseUrl(raw);
  if (url == null) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function samePath(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
