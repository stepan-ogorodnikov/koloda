import { Link, Main, mainSidebarItemLink } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { redirect } from "@tanstack/react-router";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_/settings")({
  component: SettingsRoute,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/interface" });
    }
  },
});

const LINKS = [
  { id: "interface", t: msg`settings.interface`, url: "interface" },
  { id: "learning", t: msg`settings.learning`, url: "learning" },
];

export function SettingsRoute() {
  const { _ } = useLingui();

  return (
    <>
      <Main.Sidebar>
        <Main.Titlebar>
          <Main.H1>
            {_(msg`settings.title`)}
          </Main.H1>
        </Main.Titlebar>
        {LINKS.map(({ id, t, url }) => (
          <Main.SidebarItem key={id}>
            <Link className={mainSidebarItemLink} to={`/settings/${url}`}>
              <Main.SidebarItemLinkContent>{_(t)}</Main.SidebarItemLinkContent>
            </Link>
          </Main.SidebarItem>
        ))}
      </Main.Sidebar>
      <Main.Content>
        <Outlet />
      </Main.Content>
    </>
  );
}
