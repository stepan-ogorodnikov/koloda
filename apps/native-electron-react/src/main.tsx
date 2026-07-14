import { AppProviders } from "@koloda/app-react";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { activateLanguage, getLanguage } from "./app/i18n";
import { store } from "./app/store";

function NativeApp() {
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
      activateLanguage={activateLanguage}
      getLanguage={getLanguage}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<NativeApp />);
