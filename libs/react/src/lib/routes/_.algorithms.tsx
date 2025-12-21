import { algorithmQueryKeys, queriesAtom, useTitle } from "@koloda/react";
import { AddAlgorithm } from "@koloda/react";
import { Link, Main, mainSidebarItemLink } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/algorithms")({
  component: AlgorithmsRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getAlgorithmsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: algorithmQueryKeys.all(), ...getAlgorithmsQuery() });
    return { title: msg`title.algorithms` };
  },
});

function AlgorithmsRoute() {
  useTitle();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: algorithmQueryKeys.all(), ...getAlgorithmsQuery() });
  const hasContent = !(pathname === "/algorithms" || pathname === "/algorithms/");

  return (
    <>
      <Main.Sidebar hasContent={hasContent}>
        <Main.Titlebar>
          <Main.H1>
            {_(msg`algorithms.title`)}
          </Main.H1>
          <AddAlgorithm />
        </Main.Titlebar>
        {data
          ? data.map(({ id, title }) => (
            <Main.SidebarItem key={id}>
              <Link className={mainSidebarItemLink} to="/algorithms/$algorithmId" params={{ algorithmId: id }}>
                <Main.SidebarItemLinkContent>{title}</Main.SidebarItemLinkContent>
              </Link>
            </Main.SidebarItem>
          ))
          : null}
      </Main.Sidebar>
      <Main.Content hasContent={hasContent}>
        <Outlet />
      </Main.Content>
    </>
  );
}
