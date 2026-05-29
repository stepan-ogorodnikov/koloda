import { getCSSVar, useDashboardDrawer } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import type { ComponentProps, PropsWithChildren } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { tv } from "tailwind-variants";

export function Main({ children }: PropsWithChildren) {
  return (
    <div
      className="grow flex flex-row h-full min-h-0 min-w-0 items-stretch bg-level-1 no-focus-ring"
      id="main"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

const mainTitlebar = tv({
  base: "flex flex-row items-center tb:gap-2 w-full min-w-0 min-h-14 dt:h-14 px-2",
  variants: {
    type: { sidebar: "border-b-2 border-main", content: "" },
  },
});

type MainTitlebarProps = PropsWithChildren & TWVProps<typeof mainTitlebar>;

function MainTitlebar({ variants, children }: MainTitlebarProps) {
  return (
    <div className="min-h-14 overflow-hidden">
      <div className={mainTitlebar(variants)}>{children}</div>
    </div>
  );
}

export const mainH1 = "grow px-2 text-lg truncate";

function MainH1({ children }: PropsWithChildren) {
  return <h1 className={mainH1}>{children}</h1>;
}

export const mainH2 = "px-2 text-lg truncate";

function MainH2({ children }: PropsWithChildren) {
  return <h2 className={mainH2}>{children}</h2>;
}

const mainContent = tv({
  base: [
    "grow flex-col h-full min-h-0 min-w-0 overflow-hidden",
    "tb:w-full tb:max-w-main tb:grow-0 tb:basis-full tb:mx-auto",
  ],
  variants: { hasContent: { true: "flex", false: "hidden tb:flex" } },
});

type MainContentProps = PropsWithChildren & { hasContent?: boolean };

function MainContent({ hasContent, children }: MainContentProps) {
  return <div className={mainContent({ hasContent })}>{children}</div>;
}

const mainSidebar = tv({
  base: [
    "flex flex-col shrink-0 overflow-hidden",
    "tb:min-w-48 tb:max-w-48 tb:border-r-2 tb:border-main",
    "dt:min-w-72 dt:max-w-72 dt:overflow-hidden",
  ],
  variants: { hasContent: { true: "hidden tb:flex", false: "grow tb:grow-0" } },
});

type MainSidebarProps = PropsWithChildren & { hasContent?: boolean };

function MainSidebar({ hasContent, children }: MainSidebarProps) {
  const { setToggleDisabled, sidebarPortal } = useDashboardDrawer();
  const isDrawerLayout = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);
  useEffect(() => {
    setToggleDisabled(hasContent === false);
    return () => setToggleDisabled(false);
  }, [hasContent, setToggleDisabled]);

  const content = <div className={mainSidebar({ hasContent })}>{children}</div>;

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

const mainSidebarItem = "relative flex flex-col border-b-2 border-main truncate";

function MainSidebarItem({ children }: PropsWithChildren) {
  return (
    <div className={mainSidebarItem}>
      {children}
    </div>
  );
}

export const mainSidebarItemLink = [
  "group flex flex-col p-4 text-lg no-focus-ring animate-colors",
  "fg-level-3 current:bg-main-sidebar-link-active current:fg-level-1",
].join(" ");

export const mainSidebarItemLinkContent = "z-2 absolute inset-2 p-2 rounded-lg group-focus-ring";

function MainSidebarItemLinkContent({ children }: PropsWithChildren) {
  return (
    <>
      <div className={mainSidebarItemLinkContent} />
      {children}
    </>
  );
}

const mainContainer = tv({
  base: "grow flex flex-col w-full max-w-main mx-auto min-w-0 min-h-0 overflow-y-auto no-focus-ring",
});

type MainContainerProps = ComponentProps<"div"> & TWVProps<typeof mainContainer>;

function MainContainer({ variants, ...props }: MainContainerProps) {
  return <div className={mainContainer(variants)} {...props} />;
}

Main.Titlebar = MainTitlebar;
Main.H1 = MainH1;
Main.H2 = MainH2;
Main.Content = MainContent;
Main.Sidebar = MainSidebar;
Main.SidebarItem = MainSidebarItem;
Main.SidebarItemLinkContent = MainSidebarItemLinkContent;
Main.Container = MainContainer;
