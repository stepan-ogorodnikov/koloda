import type { AIRuntime } from "@koloda/ai";
import { aiRuntimeAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { WritableAtom } from "jotai";
import type { PropsWithChildren } from "react";

export type AppStoreWrapperOptions = {
  listModels?: AIRuntime["listModels"];
};

/**
 * Real `@koloda/core-react` wiring for components that read hotkey settings or model lists.
 * There is no stored hotkeys row, so components get the default bindings.
 * WHY: a file-level mock of `@koloda/core-react` or `@koloda/ui` would leak to siblings under `isolate: false`.
 */
export function createAppStoreWrapper({ listModels }: AppStoreWrapperOptions = {}) {
  const store = createStore();
  store.set(
    queriesAtom as WritableAtom<Queries, [Queries], unknown>,
    {
      getSettingsQuery: () => ({ queryKey: queryKeys.settings.detail("hotkeys"), queryFn: async () => null }),
    } as unknown as Queries,
  );
  if (listModels) {
    store.set(aiRuntimeAtom as WritableAtom<AIRuntime, [AIRuntime], unknown>, { listModels } as unknown as AIRuntime);
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return function AppStoreWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  };
}
