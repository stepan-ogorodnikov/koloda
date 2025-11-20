import { queriesAtom } from "@koloda/react";
import { AddAlgorithm } from "@koloda/react";
import { Link, Main, mainSidebarItemLink } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/algorithms")({
  component: AlgorithmsRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getAlgorithmsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["algorithms"], ...getAlgorithmsQuery() });
  },
});

export function AlgorithmsRoute() {
  const { _ } = useLingui();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["algorithms"], ...getAlgorithmsQuery() });

  return (
    <>
      <Main.Sidebar>
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
      <Main.Content>
        <Outlet />
      </Main.Content>
    </>
  );
}
