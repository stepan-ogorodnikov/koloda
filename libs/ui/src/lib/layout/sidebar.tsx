import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { tv } from "tailwind-variants";
import { useLayoutDrawer } from "./drawer";

const layoutSidebar = tv({
  base: [
    "flex flex-col shrink-0 overflow-hidden",
    "wd:w-[clamp(14rem,25%,20rem)] wd:border-r-2 wd:border-main wd:overflow-hidden",
  ],
  variants: { hasContent: { true: "hidden wd:flex", false: "grow wd:grow-0" } },
});

type LayoutSidebarProps = PropsWithChildren & { hasContent?: boolean };

export function LayoutSidebar({ hasContent, children }: LayoutSidebarProps) {
  const { setToggleDisabled, sidebarPortal } = useLayoutDrawer();
  const isDrawerLayout = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);
  useEffect(() => {
    setToggleDisabled(hasContent === false);
    return () => setToggleDisabled(false);
  }, [hasContent, setToggleDisabled]);

  const content = <div className={layoutSidebar({ hasContent })}>{children}</div>;

  if (hasContent && isDrawerLayout) {
    return sidebarPortal
      ? createPortal(
        <div className="flex h-full min-h-0 flex-col overflow-hidden">{children}</div>,
        sidebarPortal,
      )
      : null;
  }

  return content;
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
