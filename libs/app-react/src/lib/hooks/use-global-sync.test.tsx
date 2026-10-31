import { langAtom, queriesAtom, schemeAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { useGlobalSync } from "./use-global-sync";

describe("useGlobalSync", () => {
  it("keeps this device's language when the saved interface settings load with another", async () => {
    const rows: Record<string, unknown> = {
      interface: { name: "interface", content: { language: "ru", scheme: "dark" } },
      learning: null,
    };
    const queries = {
      getSettingsQuery: (name: string) => ({ queryKey: ["settings", name], queryFn: async () => rows[name] }),
    } as unknown as Queries;
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
    store.set(langAtom, "en");
    store.set(schemeAtom, "light");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    renderHook(() => useGlobalSync(), { wrapper: Wrapper });

    // The row has loaded once its scheme is applied
    await waitFor(() => expect(store.get(schemeAtom)).toBe("dark"));
    expect(store.get(langAtom)).toBe("en");
  });
});
