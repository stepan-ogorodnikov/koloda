import { Layout, layoutSidebarItemLink, Link, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Outlet } from "@tanstack/react-router";

const settingsLinks = [
  { to: "/settings/interface", label: msg`settings.interface` },
  { to: "/settings/learning", label: msg`settings.learning` },
  { to: "/settings/hotkeys", label: msg`settings.hotkeys` },
] as const;

export function SettingsPage() {
  const { _ } = useLingui();
  const ref = useRouteFocus();
  const isMotionOn = useMotionSetting();

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>{_(msg`settings.title`)}</Layout.H1>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <div className="flex flex-col">
            {settingsLinks.map(({ to, label }) => (
              <Layout.SidebarItem key={to}>
                <Link className={layoutSidebarItemLink} to={to} viewTransition={isMotionOn}>
                  <Layout.SidebarItemLinkContent>{_(label)}</Layout.SidebarItemLinkContent>
                </Link>
              </Layout.SidebarItem>
            ))}
          </div>
        </Layout.Container>
      </Layout.Sidebar>
      <Layout.Content>
        <Outlet />
      </Layout.Content>
    </>
  );
}
