import { queriesAtom } from "@koloda/core-react";
import { AddAlgorithm } from "@koloda/srs-react";
import { Layout, layoutSidebarItemLink, Link, QueryState, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export function AlgorithmsPage() {
  const ref = useRouteFocus();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery(getAlgorithmsQuery());

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>Algorithms</Layout.H1>
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
      <Layout.Content>
        <Outlet />
      </Layout.Content>
    </>
  );
}
