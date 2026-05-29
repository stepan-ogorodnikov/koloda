import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { AddAlgorithm } from "@koloda/srs-react";
import { QueryState } from "@koloda/ui";
import { Layout, layoutSidebarItemLink, Link, useMotionSetting, useRouteFocus } from "@koloda/ui";
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
    queryClient.ensureQueryData({ queryKey: queryKeys.algorithms.all(), ...getAlgorithmsQuery() });
    return { title: msg`title.algorithms` };
  },
});

function AlgorithmsRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery({ queryKey: queryKeys.algorithms.all(), ...getAlgorithmsQuery() });
  const hasContent = !(pathname === "/algorithms" || pathname === "/algorithms/");

  return (
    <>
      <Layout.Sidebar hasContent={hasContent}>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>
            {_(msg`algorithms.title`)}
          </Layout.H1>
          <AddAlgorithm />
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <QueryState query={query}>
            {(data) => (
              <div className="flex flex-col">
                {data.map(({ id, title }) => (
                  <Layout.SidebarItem key={id}>
                    <Link
                      className={layoutSidebarItemLink}
                      to="/algorithms/$algorithmId"
                      params={{ algorithmId: id }}
                      viewTransition={isMotionOn}
                    >
                      <Layout.SidebarItemLinkContent>{title}</Layout.SidebarItemLinkContent>
                    </Link>
                  </Layout.SidebarItem>
                ))}
              </div>
            )}
          </QueryState>
        </Layout.Container>
      </Layout.Sidebar>
      <Layout.Content variants={{ hasContent: hasContent }}>
        <Outlet />
      </Layout.Content>
    </>
  );
}
