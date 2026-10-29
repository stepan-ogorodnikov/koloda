import { Layout, layoutSidebarItemLink, Link, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { Outlet } from "@tanstack/react-router";

const settingsLinks = [
  { to: "/settings/interface", label: "Interface" },
  { to: "/settings/learning", label: "Learning" },
  { to: "/settings/hotkeys", label: "Hotkeys" },
] as const;

export function SettingsPage() {
  const ref = useRouteFocus();
  const isMotionOn = useMotionSetting();

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>Settings</Layout.H1>
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <div className="flex flex-col">
            {settingsLinks.map(({ to, label }) => (
              <Layout.SidebarItem key={to}>
                <Link className={layoutSidebarItemLink} to={to} viewTransition={isMotionOn}>
                  <Layout.SidebarItemLinkContent>{label}</Layout.SidebarItemLinkContent>
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
