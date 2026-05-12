import { useEffect, useRef } from "react";

type TitlebarPlatform = "linux" | "macos" | "windows";

export function ElectronTitlebar() {
  const platform = getTitlebarPlatform();
  const titlebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.on("window:maximize-changed", (...args: unknown[]) => {
      // Maximize state changes are handled by native Electron overlay
      void args;
    });
  }, []);

  useEffect(() => {
    if (platform === "macos") return;

    function updateOverlay() {
      const style = getComputedStyle(document.documentElement);
      const color = style.getPropertyValue("--titlebar-overlay-color").trim();
      const symbolColor = style.getPropertyValue("--titlebar-overlay-symbol-color").trim();

      window.electronAPI.invoke("window:set-title-bar-overlay", { color, symbolColor });
    }

    const observer = new MutationObserver(updateOverlay);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    updateOverlay();

    return () => observer.disconnect();
  }, [platform]);

  const handleDragDoubleClick = () => {
    window.electronAPI.invoke("window:maximize");
  };

  return (
    <div ref={titlebarRef} className="flex h-8 w-full shrink-0 items-center bg-body select-none [-webkit-user-select:none]"
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
