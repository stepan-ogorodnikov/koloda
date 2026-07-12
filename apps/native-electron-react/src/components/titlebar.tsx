import { getAppPlatform } from "@koloda/app";
import { Titlebar as TitlebarContent } from "@koloda/ui";
import { useEffect, useRef, useState } from "react";

type TitlebarOverlayOptions = {
  color: string;
  symbolColor: string;
  height: number;
};

type WindowButtonPositionOptions = { titlebarHeight: number };

const platform = getAppPlatform();

const defaultOverlayWidth = (() => {
  if (platform === "macos") return 64;
  if (platform === "linux") return Math.round(100 * window.devicePixelRatio);
  const winBuild = parseInt(navigator.userAgent.match(/Windows NT \d+\.\d+;.*?(\d{5,})/)?.[1] || "0");
  const base = winBuild >= 22000 ? 140 : 110;
  return Math.round(base * window.devicePixelRatio);
})();

const titlebar = [
  "relative flex flex-col shrink-0",
  "h-(--titlebar-height) w-full border-b-2 border-main bg-body",
  "box-content select-none [-webkit-user-select:none]",
].join(" ");

export function Titlebar() {
  const titlebarRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<TitlebarOverlayOptions | undefined>(undefined);
  const windowButtonPositionRef = useRef<WindowButtonPositionOptions | undefined>(undefined);
  const [overlayWidth, setOverlayWidth] = useState(defaultOverlayWidth);

  useEffect(() => {
    window.electronAPI
      .invoke<number>("window:get-overlay-width")
      .then(setOverlayWidth)
      .catch(() => {});
  }, []);

  useEffect(() => {
    window.electronAPI.on("window:maximize-changed", (...args: unknown[]) => {
      void args;
    });
  }, []);

  useEffect(() => {
    let rafId = 0;

    function scheduleUpdateWindowControls() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateWindowControls();
      });
    }

    function updateWindowControls() {
      const el = titlebarRef.current;
      if (!el) return;

      if (platform === "macos") {
        updateWindowButtonPosition(el);
        return;
      }

      updateOverlay(el);
    }

    function updateWindowButtonPosition(el: HTMLElement) {
      const nextPosition = { titlebarHeight: getTitlebarNativeContentHeight(el) };
      const currentPosition = windowButtonPositionRef.current;
      if (currentPosition?.titlebarHeight === nextPosition.titlebarHeight) return;

      windowButtonPositionRef.current = nextPosition;
      void window.electronAPI.invoke("window:set-window-button-position", nextPosition);
    }

    function updateOverlay(el: HTMLElement) {
      const rootStyle = getComputedStyle(document.documentElement);
      // Electron titleBarOverlay only accepts rgba/hsla/hex — use dedicated hex tokens.
      const color =
        toHexColor(rootStyle.getPropertyValue("--titlebar-overlay-color").trim()) ||
        cssVarToHex("--titlebar-overlay-color");
      const symbolColor =
        toHexColor(rootStyle.getPropertyValue("--titlebar-overlay-symbol-color").trim()) ||
        cssVarToHex("--titlebar-overlay-symbol-color");
      const height = getTitlebarNativeContentHeight(el);

      if (!color || !symbolColor) return;

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

    const classObserver = new MutationObserver(scheduleUpdateWindowControls);
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-light-theme", "data-dark-theme"],
    });

    const resizeObserver = new ResizeObserver(scheduleUpdateWindowControls);
    const el = titlebarRef.current;
    if (el) resizeObserver.observe(el);

    window.addEventListener("resize", scheduleUpdateWindowControls);
    const unsubscribeZoomFactorChanged = window.electronAPI.onZoomFactorChanged(scheduleUpdateWindowControls);

    scheduleUpdateWindowControls();

    return () => {
      cancelAnimationFrame(rafId);
      classObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdateWindowControls);
      unsubscribeZoomFactorChanged();
    };
  }, []);

  const handleDragDoubleClick = () => {
    void window.electronAPI.invoke("window:maximize");
  };

  return (
    <div className={titlebar} style={{ appRegion: "drag" } as React.CSSProperties} ref={titlebarRef}>
      <div
        className="flex items-center h-full w-full"
        style={{ [platform === "macos" ? "paddingLeft" : "paddingRight"]: `${overlayWidth}px` }}
      >
        <TitlebarContent />
      </div>
      <div className="absolute inset-0" onDoubleClick={handleDragDoubleClick} />
    </div>
  );
}

function getTitlebarNativeContentHeight(el: HTMLElement) {
  const contentHeight = parseFloat(getComputedStyle(el).height);
  const height = Number.isNaN(contentHeight) ? el.clientHeight : contentHeight;
  return Math.round(height * window.electronAPI.getZoomFactor());
}

/** Normalize CSS colors to #rrggbb for Electron's titleBarOverlay API. */
function toHexColor(value: string) {
  if (!value) return "";
  if (value.startsWith("#")) {
    if (value.length === 4) {
      const [, r, g, b] = value;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return value.slice(0, 7).toLowerCase();
  }

  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)[%\s,]+([\d.]+)[%\s,]+([\d.]+)/i);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${[r, g, b].map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
  }

  return "";
}

function cssVarToHex(varName: string) {
  const probe = document.createElement("div");
  probe.style.color = `var(${varName})`;
  document.documentElement.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return toHexColor(resolved);
}
