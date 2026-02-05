import { algorithmsQueryKeys, queriesAtom, QueryState, useTitle } from "@koloda/react";
import { AddAlgorithm } from "@koloda/react";
import { Link, Main, mainSidebarItemLink, useMotionSetting } from "@koloda/ui";
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
    queryClient.ensureQueryData({ queryKey: algorithmsQueryKeys.all(), ...getAlgorithmsQuery() });
    return { title: msg`title.algorithms` };
  },
});

function AlgorithmsRoute() {
  useTitle();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery({ queryKey: algorithmsQueryKeys.all(), ...getAlgorithmsQuery() });
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
        <QueryState query={query}>
          {(data) => (
            <div className="flex flex-col">
              {data.map(({ id, title }) => (
                <Main.SidebarItem key={id}>
                  <Link
                    className={mainSidebarItemLink}
                    to="/algorithms/$algorithmId"
                    params={{ algorithmId: id }}
                    viewTransition={isMotionOn}
                  >
                    <Main.SidebarItemLinkContent>{title}</Main.SidebarItemLinkContent>
                  </Link>
                </Main.SidebarItem>
              ))}
            </div>
          )}
        </QueryState>
      </Main.Sidebar>
      <Main.Content hasContent={hasContent}>
        <Outlet />
      </Main.Content>
    </>
  );
}
