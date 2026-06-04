import type { PropsWithChildren, ReactNode } from "react";
import "@fontsource-variable/inter";
import { useMemo, useState } from "react";
import { tv } from "tailwind-variants";
import type { TWVProps } from "../types";
import { LayoutContainer, LayoutContent } from "./content";
import { LayoutDrawer, LayoutPortalContext } from "./drawer";
import { LayoutH1, LayoutH2, LayoutHeader } from "./header";
import { LayoutNav, LayoutNavLink } from "./nav";
import { LayoutSidebar, LayoutSidebarItem, LayoutSidebarItemLinkContent } from "./sidebar";

const layout = tv({
  base: "flex flex-col min-w-screen min-h-screen h-screen overflow-hidden",
});

type LayoutProps = PropsWithChildren & TWVProps<typeof layout> & {
  titlebar?: ReactNode;
};

export function Layout({ variants, titlebar, children }: LayoutProps) {
  const [navPortal, setNavPortal] = useState<HTMLElement | null>(null);
  const [sidebarPortal, setSidebarPortal] = useState<HTMLElement | null>(null);
  const portalValue = useMemo(() => ({ navPortal, sidebarPortal }), [navPortal, sidebarPortal]);

  return (
    <div className={layout(variants)}>
      {titlebar}
      <LayoutPortalContext.Provider value={portalValue}>
        <div
          className="relative grow flex flex-row h-full w-full min-w-80 min-h-0 overflow-hidden bg-level-1"
          id="main"
          tabIndex={-1}
        >
          {children}
          <LayoutDrawer setNavPortal={setNavPortal} setSidebarPortal={setSidebarPortal} />
        </div>
      </LayoutPortalContext.Provider>
    </div>
  );
}

Layout.Nav = LayoutNav;
Layout.NavLink = LayoutNavLink;
Layout.Header = LayoutHeader;
Layout.H1 = LayoutH1;
Layout.H2 = LayoutH2;
Layout.Content = LayoutContent;
Layout.Sidebar = LayoutSidebar;
Layout.SidebarItem = LayoutSidebarItem;
Layout.SidebarItemLinkContent = LayoutSidebarItemLinkContent;
Layout.Container = LayoutContainer;
