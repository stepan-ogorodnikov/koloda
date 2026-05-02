import { appEntryAtom, useTitle } from "@koloda/react-base";
import type { Queries } from "@koloda/react-base";
import { NotFound } from "@koloda/ui";
import { type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { App } from "../components/app";

type RouterContext = {
  queryClient: QueryClient;
  queries: Queries;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: RootNotFoundRoute,
});

function RootLayout() {
  useTitle();
  const { component: AppEntry } = useAtomValue(appEntryAtom);

  if (!AppEntry) return null;

  return (
    <>
      <HeadContent />
      <AppEntry />
    </>
  );
}

function RootNotFoundRoute() {
  return (
    <App>
      <NotFound />
    </App>
  );
}
