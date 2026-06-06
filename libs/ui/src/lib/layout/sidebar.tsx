import { atom, useSetAtom } from "jotai";
import type { PropsWithChildren } from "react";
import { useContext, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { LayoutPortalContext } from "./layout";

export const layoutHasSidebarAtom = atom(false);

export function LayoutSidebar({ children }: PropsWithChildren) {
  const { sidebarPortal } = useContext(LayoutPortalContext) ?? {};
  const setHasSidebar = useSetAtom(layoutHasSidebarAtom);

  useLayoutEffect(() => {
    setHasSidebar(true);
    return () => setHasSidebar(false);
  }, [setHasSidebar]);

  return sidebarPortal ? createPortal(children, sidebarPortal) : null;
}

export function LayoutSidebarItem({ children }: PropsWithChildren) {
  return (
    <div className="relative flex flex-col border-b-2 border-main truncate">
      {children}
    </div>
  );
}

export const layoutSidebarItemLink = [
  "group flex flex-col p-4 text-lg no-focus-ring animate-colors",
  "fg-level-3 current:bg-main-sidebar-link-active current:fg-level-1",
].join(" ");

export function LayoutSidebarItemLinkContent({ children }: PropsWithChildren) {
  return (
    <>
      <div className="z-2 absolute inset-2 p-2 rounded-lg group-focus-ring" />
      {children}
    </>
  );
}
