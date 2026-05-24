export type AppPlatform = "linux" | "macos" | "windows";

export function getAppPlatform(): AppPlatform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const raw = (nav.userAgentData?.platform || navigator.userAgent).toLowerCase();

  if (raw.includes("mac")) return "macos";
  if (raw.includes("win")) return "windows";
  return "linux";
}
