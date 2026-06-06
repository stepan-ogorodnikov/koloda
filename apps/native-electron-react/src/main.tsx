import { routeTree } from "@koloda/app-react";
import { langAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { queriesAtom } from "@koloda/core-react";
import { NotFound } from "@koloda/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { I18nProviderProps } from "@lingui/react";
import { I18nProvider as ReactAriaI18nProvider } from "@react-aria/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider, useAtom } from "jotai";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { activateLanguage, getLanguage } from "./app/i18n";
import { store } from "./app/store";

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const router = createRouter({
  routeTree,
  basepath: import.meta.env.VITE_BASE,
  context: {
    queryClient,
    queries: store.get(queriesAtom) as Queries,
  },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: NotFound,
});

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(<App />);

function App() {
  const [lang, setLang] = useAtom(langAtom);
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    activateLanguage(getLanguage()).then(() => {
      setLang(i18n.locale);
      setIsI18nReady(true);
    });
  }, [setLang]);

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

  if (!isI18nReady) return null;

  return (
    <StrictMode>
      <ReactAriaI18nProvider locale={lang}>
        <I18nProvider i18n={i18n as unknown as I18nProviderProps["i18n"]}>
          <QueryClientProvider client={queryClient}>
            <JotaiProvider store={store}>
              <RouterProvider router={router} />
            </JotaiProvider>
          </QueryClientProvider>
        </I18nProvider>
      </ReactAriaI18nProvider>
    </StrictMode>
  );
}
