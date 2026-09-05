import { appEntryAtom, useTitle } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { NotFound } from "@koloda/ui";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { App } from "../components/app";
import { RouteError } from "../components/route-error";

type RouterContext = {
  queryClient: QueryClient;
  queries: Queries;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: RootNotFoundRoute,
  errorComponent: RouteError,
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
