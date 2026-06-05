import { useTitle } from "@koloda/core-react";
import { NotFound } from "@koloda/ui";
import { Layout, layoutSidebarItemLink, Link, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_/settings")({
  component: SettingsRoute,
  loader: () => ({ title: msg`title.settings` }),
  notFoundComponent: NotFound,
});

const LINKS = [
  { id: "interface", t: msg`settings.interface`, url: "interface" },
  { id: "learning", t: msg`settings.learning`, url: "learning" },
  { id: "hotkeys", t: msg`settings.hotkeys`, url: "hotkeys" },
  { id: "ai", t: msg`settings.ai`, url: "ai" },
];

function SettingsRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>{_(msg`settings.title`)}</Layout.H1>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          {LINKS.map(({ id, t, url }) => (
            <Layout.SidebarItem key={id}>
              <Link
                className={layoutSidebarItemLink}
                to={`/settings/${url}`}
                viewTransition={isMotionOn}
              >
                <Layout.SidebarItemLinkContent>{_(t)}</Layout.SidebarItemLinkContent>
              </Link>
            </Layout.SidebarItem>
          ))}
        </Layout.Container>
      </Layout.Sidebar>
      <Layout.Content>
        <Outlet />
      </Layout.Content>
    </>
  );
}
