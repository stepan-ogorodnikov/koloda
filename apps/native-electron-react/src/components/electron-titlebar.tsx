import { useEffect, useRef } from "react";

type TitlebarPlatform = "linux" | "macos" | "windows";
type TitlebarOverlayOptions = {
  color: string;
  symbolColor: string;
  height: number;
};

const titlebar = [
  "flex flex-row items-center shrink-0 h-(--titlebar-height) w-full bg-body",
  "box-content select-none [-webkit-user-select:none]",
  "border-b-2 border-main",
].join(" ");

export function ElectronTitlebar() {
  const platform = getTitlebarPlatform();
  const titlebarRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<TitlebarOverlayOptions | undefined>(undefined);

  useEffect(() => {
    window.electronAPI.on("window:maximize-changed", (...args: unknown[]) => {
      // Maximize state changes are handled by native Electron overlay
      void args;
    });
  }, []);

  useEffect(() => {
    if (platform === "macos") return;

    function updateOverlay() {
      const el = titlebarRef.current;
      if (!el) return;

      const rootStyle = getComputedStyle(document.documentElement);
      const color = rootStyle.getPropertyValue("--titlebar-overlay-color").trim();
      const symbolColor = rootStyle.getPropertyValue("--titlebar-overlay-symbol-color").trim();
      const height = getTitlebarOverlayHeight(el);

      const nextOverlay = { color, symbolColor, height };
      const currentOverlay = overlayRef.current;
      if (
        currentOverlay &&
        currentOverlay.color === nextOverlay.color &&
        currentOverlay.symbolColor === nextOverlay.symbolColor &&
        currentOverlay.height === nextOverlay.height
      ) {
        return;
      }

      overlayRef.current = nextOverlay;
      void window.electronAPI.invoke("window:set-title-bar-overlay", nextOverlay);
    }

    const classObserver = new MutationObserver(updateOverlay);
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const resizeObserver = new ResizeObserver(updateOverlay);
    const el = titlebarRef.current;
    if (el) resizeObserver.observe(el);

    window.addEventListener("resize", updateOverlay);
    const unsubscribeZoomFactorChanged = window.electronAPI.onZoomFactorChanged(updateOverlay);

    updateOverlay();

    return () => {
      classObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateOverlay);
      unsubscribeZoomFactorChanged();
    };
  }, [platform]);

  const handleDragDoubleClick = () => {
    void window.electronAPI.invoke("window:maximize");
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

function getTitlebarOverlayHeight(el: HTMLElement) {
  const contentHeight = parseFloat(getComputedStyle(el).height);
  const height = Number.isNaN(contentHeight) ? el.clientHeight : contentHeight;
  return Math.round(height * window.electronAPI.getZoomFactor());
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
