import { AppProviders } from "@koloda/app-react";
import { createHashHistory } from "@tanstack/react-router";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { installElectronCloseCoordination } from "./app/electron-close-coordination";
import { activateLanguage, getLanguage } from "./app/i18n";
import { store } from "./app/store";

// WHY: Packaged Electron loads index.html via file://. Browser history then
// reads pathname `/C:/.../index.html` (or `/.../index.html`), matches no route,
// and shows the 404 screen. Hash history keeps app paths in the fragment.
const history = window.location.protocol === "file:" ? createHashHistory() : undefined;

function NativeApp() {
  useEffect(() => {
    // WHY: Electron must await interrupt + flush before destroying the window;
    // browser pagehide alone is not durable (see #10 / window-close-coordinator).
    return installElectronCloseCoordination(store);
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const stored = localStorage.getItem("zoom-level");
    if (stored !== null) {
      const level = Number(stored);
      if (!Number.isNaN(level)) api.setZoomLevel(level);
    }

    const unsubscribe = api.onZoomFactorChanged(() => {
      localStorage.setItem("zoom-level", String(api.getZoomLevel()));
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        api.zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        api.zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        api.zoomReset();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        api.zoomIn();
      } else {
        api.zoomOut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <AppProviders
      store={store}
      basepath={import.meta.env.VITE_BASE}
      history={history}
      activateLanguage={activateLanguage}
      getLanguage={getLanguage}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<NativeApp />);
