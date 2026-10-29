import { langAtom } from "@koloda/core-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { I18nProvider as ReactAriaI18nProvider } from "@react-aria/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider, useAtomValue } from "jotai";
import { StrictMode } from "react";
import type { PropsWithChildren } from "react";
import { router } from "./router";
import { store } from "./store";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// WHY: react-aria formats and labels by locale, so it reads langAtom and re-renders when the language changes.
function ReactAriaLocale({ children }: PropsWithChildren) {
  const lang = useAtomValue(langAtom);
  return <ReactAriaI18nProvider locale={lang}>{children}</ReactAriaI18nProvider>;
}

export function Providers() {
  return (
    <StrictMode>
      <JotaiProvider store={store}>
        <ReactAriaLocale>
          <I18nProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </I18nProvider>
        </ReactAriaLocale>
      </JotaiProvider>
    </StrictMode>
  );
}
