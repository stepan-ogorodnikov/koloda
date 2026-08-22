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
import type { createHashHistory } from "@tanstack/react-router";
import { Provider as JotaiProvider, useAtom } from "jotai";
import type { createStore } from "jotai";
import { StrictMode, useEffect, useState } from "react";
import { routeTree } from "./routeTree.gen";

type Store = ReturnType<typeof createStore>;

export type AppProvidersProps = {
  store: Store;
  basepath?: string;
  history?: ReturnType<typeof createHashHistory>;
  activateLanguage: (locale: string) => Promise<void>;
  getLanguage: () => string;
};

function createAppRouter(
  store: Store,
  queryClient: QueryClient,
  basepath?: string,
  history?: ReturnType<typeof createHashHistory>,
) {
  return createRouter({
    routeTree,
    basepath,
    history,
    context: {
      queryClient,
      queries: store.get(queriesAtom) as Queries,
    },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFound,
  });
}

export function AppProviders({ store, basepath, history, activateLanguage, getLanguage }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            // WHY: all data lives in a local database and changes only through
            // explicit mutations, which invalidate the affected queries. Without
            // a staleTime every (re)mounting observer considers data stale and
            // refetches, replacing cached object identities and triggering
            // re-render cascades across consumers of the same query.
            staleTime: 60_000,
          },
        },
      }),
  );
  const [router] = useState(() => createAppRouter(store, queryClient, basepath, history));

  return (
    <StrictMode>
      <JotaiProvider store={store}>
        <AppProvidersInner
          activateLanguage={activateLanguage}
          getLanguage={getLanguage}
          queryClient={queryClient}
          router={router}
        />
      </JotaiProvider>
    </StrictMode>
  );
}

function AppProvidersInner({
  activateLanguage,
  getLanguage,
  queryClient,
  router,
}: {
  activateLanguage: (locale: string) => Promise<void>;
  getLanguage: () => string;
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
}) {
  const [lang, setLang] = useAtom(langAtom);
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    activateLanguage(getLanguage()).then(() => {
      setLang(i18n.locale);
      setIsI18nReady(true);
    });
  }, [activateLanguage, getLanguage, setLang]);

  if (!isI18nReady) return null;

  return (
    <ReactAriaI18nProvider locale={lang}>
      <I18nProvider i18n={i18n as unknown as I18nProviderProps["i18n"]}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nProvider>
    </ReactAriaI18nProvider>
  );
}
