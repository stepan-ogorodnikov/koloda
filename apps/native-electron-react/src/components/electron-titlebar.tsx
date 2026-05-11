import { useEffect } from "react";

type TitlebarPlatform = "linux" | "macos" | "windows";

export function ElectronTitlebar() {
  const platform = getTitlebarPlatform();

  useEffect(() => {
    window.electronAPI.on("window:maximize-changed", (...args: unknown[]) => {
      // Maximize state changes are handled by native Electron overlay
      void args;
    });
  }, []);

  const handleDragDoubleClick = () => {
    window.electronAPI.invoke("window:maximize");
  };

  return (
    <div className="flex h-8 w-full shrink-0 items-center border-b-2 border-main bg-body select-none [-webkit-user-select:none]"
      style={{ appRegion: "drag" } as React.CSSProperties}
    >
      {platform === "macos" && (
        <div className="h-full grow" onDoubleClick={handleDragDoubleClick} />
      )}
      {platform !== "macos" && (
        <div className="h-full grow" onDoubleClick={handleDragDoubleClick} />
      )}
    </div>
  );
}

function getTitlebarPlatform(): TitlebarPlatform {
  const platform = getNavigatorPlatform().toLowerCase();
  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  return "linux";
}

function getNavigatorPlatform() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.userAgent;
}
