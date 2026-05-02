import { useTitle } from "@koloda/react-base";
import { NotFound } from "@koloda/ui";
import { Link, Main, mainSidebarItemLink, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

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
  const { pathname } = useLocation();
  const hasContent = !(pathname === "/settings" || pathname === "/settings/");

  return (
    <>
      <Main.Sidebar hasContent={hasContent}>
        <Main.Titlebar>
          <Main.H1>{_(msg`settings.title`)}</Main.H1>
        </Main.Titlebar>
        <Main.Container ref={ref} tabIndex={-1}>
          {LINKS.map(({ id, t, url }) => (
            <Main.SidebarItem key={id}>
              <Link
                className={mainSidebarItemLink}
                to={`/settings/${url}`}
                viewTransition={isMotionOn}
              >
                <Main.SidebarItemLinkContent>{_(t)}</Main.SidebarItemLinkContent>
              </Link>
            </Main.SidebarItem>
          ))}
        </Main.Container>
      </Main.Sidebar>
      <Main.Content hasContent={hasContent}>
        <Outlet />
      </Main.Content>
    </>
  );
}
