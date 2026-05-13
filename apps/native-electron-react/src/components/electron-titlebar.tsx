import { useEffect, useRef } from "react";

type TitlebarPlatform = "linux" | "macos" | "windows";

const titlebar = [
  "flex flex-row items-center shrink-0 h-(--titlebar-height) w-full bg-body",
  "box-content select-none [-webkit-user-select:none]",
].join(" ");

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
      const height = parseTitlebarHeight(style);

      window.electronAPI.invoke("window:set-title-bar-overlay", { color, symbolColor, height });
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
    <div
      className={titlebar}
      style={{ appRegion: "drag" } as React.CSSProperties}
      ref={titlebarRef}
    >
      {platform === "macos" && <div className="h-full grow" onDoubleClick={handleDragDoubleClick} />}
      {platform !== "macos" && <div className="h-full grow" onDoubleClick={handleDragDoubleClick} />}
    </div>
  );
}

function getTitlebarPlatform(): TitlebarPlatform {
  const platform = getNavigatorPlatform().toLowerCase();
  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  return "linux";
}

function parseTitlebarHeight(style: CSSStyleDeclaration): number | undefined {
  const raw = style.getPropertyValue("--titlebar-height");
  const rem = parseFloat(raw);
  if (Number.isNaN(rem)) return undefined;
  const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Math.round(rem * fontSize);
}

function getNavigatorPlatform() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.userAgent;
}
