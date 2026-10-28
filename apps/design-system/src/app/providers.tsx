import { NotFound } from "@koloda/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { I18nProvider as ReactAriaI18nProvider } from "@react-aria/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider } from "jotai";
import { StrictMode } from "react";
import { Shell } from "../components/shell";
import { store } from "./store";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// WHY: `Link`, `NotFound`, and the layout read router context, so pages render inside a router.
// Hash history keeps routes out of `location.search`, where `?theme=` lives.
const router = createRouter({
  routeTree: createRootRoute({ component: Shell }),
  history: createHashHistory(),
  defaultNotFoundComponent: NotFound,
});

export function Providers() {
  return (
    <StrictMode>
      <JotaiProvider store={store}>
        <ReactAriaI18nProvider locale="en">
          <I18nProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </I18nProvider>
        </ReactAriaI18nProvider>
      </JotaiProvider>
    </StrictMode>
  );
}
