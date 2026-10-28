import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { I18nProvider as ReactAriaI18nProvider } from "@react-aria/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider } from "jotai";
import { StrictMode } from "react";
import { router } from "./router";
import { store } from "./store";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
