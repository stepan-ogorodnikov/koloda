import { NotFound, type Queries, queriesAtom } from "@koloda/react";
import { langAtom, routeTree } from "@koloda/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { I18nProviderProps } from "@lingui/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Provider as JotaiProvider, useSetAtom } from "jotai";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { activateLanguage, getLanguage } from "./app/i18n";
import { store } from "./app/store";

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

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

const root = createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(<App />);

function App() {
  const setLang = useSetAtom(langAtom);
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    activateLanguage(getLanguage()).then(() => {
      setLang(i18n.locale);
      setIsI18nReady(true);
    });
  }, [setLang]);

  if (!isI18nReady) return null;

  return (
    <StrictMode>
      <I18nProvider i18n={i18n as unknown as I18nProviderProps["i18n"]}>
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>
            <RouterProvider router={router} />
            <TanStackDevtools
              plugins={[
                {
                  name: "TanStack Query",
                  render: <ReactQueryDevtoolsPanel />,
                  defaultOpen: true,
                },
                {
                  name: "TanStack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                  defaultOpen: false,
                },
              ]}
            />
          </JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>
    </StrictMode>
  );
}
