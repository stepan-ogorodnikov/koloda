import { AppProviders } from "@koloda/app-react";
import { createHashHistory } from "@tanstack/react-router";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { installElectronCloseCoordination } from "./app/electron-close-coordination";
import { activateLanguage, getLanguage } from "./app/i18n";
import { store } from "./app/store";
import { useElectronZoom } from "./app/use-electron-zoom";

// WHY: Packaged Electron loads index.html via file://. Browser history then
// reads pathname `/C:/.../index.html` (or `/.../index.html`), matches no route,
// and shows the 404 screen. Hash history keeps app paths in the fragment.
const history = window.location.protocol === "file:" ? createHashHistory() : undefined;

function NativeApp() {
  useElectronZoom();

  useEffect(() => {
    // WHY: Electron must await interrupt + flush before destroying the window;
    // browser pagehide alone is not durable (see #10 / window-close-coordinator).
    return installElectronCloseCoordination(store);
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
