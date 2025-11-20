import { type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { atom, useAtomValue } from "jotai";
import { type JSX } from "react";
import type { Queries } from "../queries";

export const appEntryAtom = atom<{ component: (() => JSX.Element) | null }>({ component: null });

type RouterContext = {
  queryClient: QueryClient;
  queries: Queries;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootRoute,
});

function RootRoute() {
  const { component: AppEntry } = useAtomValue(appEntryAtom);

  if (!AppEntry) return null;

  return <AppEntry />;
}
