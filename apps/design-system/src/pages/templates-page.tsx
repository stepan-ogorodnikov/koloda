import { queriesAtom } from "@koloda/core-react";
import { AddTemplate } from "@koloda/srs-react";
import { Layout, layoutSidebarItemLink, Link, QueryState, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export function TemplatesPage() {
  const { _ } = useLingui();
  const ref = useRouteFocus();
  const { getTemplatesQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery(getTemplatesQuery());

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>{_(msg`templates.title`)}</Layout.H1>
          <AddTemplate />
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <QueryState query={query}>
            {(data) => (
              <div className="flex flex-col">
                {data.map(({ id, title }) => (
                  <Layout.SidebarItem key={id}>
                    <Link
                      className={layoutSidebarItemLink}
                      to="/templates/$templateId"
                      params={{ templateId: id }}
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
