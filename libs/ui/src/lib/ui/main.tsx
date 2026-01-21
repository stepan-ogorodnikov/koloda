import { tabs } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export const main = "grow flex flex-row min-w-0 rounded-xl bg-level-1 border-2 border-main no-focus-ring";

export function Main({ children }: PropsWithChildren) {
  return <div className={main} id="main" tabIndex={-1}>{children}</div>;
}

export const mainTitlebar =
  "flex flex-row items-center tb:gap-2 w-full min-w-0 min-h-14 dt:h-14 px-2 border-b-2 border-main";

export function MainTitlebar({ children }: PropsWithChildren) {
  return (
    <div className="overflow-hidden">
      <div className={mainTitlebar}>{children}</div>
    </div>
  );
}

export const mainH1 = "grow px-2 text-lg font-semibold tracking-normal truncate";

function MainH1({ children }: PropsWithChildren) {
  return <h1 className={mainH1}>{children}</h1>;
}

export const mainH2 = "px-2 text-lg font-semibold tracking-normal truncate";

function MainH2({ children }: PropsWithChildren) {
  return <h2 className={mainH2}>{children}</h2>;
}

const mainContent = tv({
  base: "grow flex-col min-w-0",
  variants: { hasContent: { true: "flex", false: "hidden tb:flex" } },
});

type MainContentProps = PropsWithChildren & { hasContent?: boolean };

function MainContent({ hasContent, children }: MainContentProps) {
  return <div className={mainContent({ hasContent })}>{children}</div>;
}

const mainSidebar = tv({
  base: "flex-col overflow-hidden tb:min-w-48 tb:max-w-48 dt:min-w-72 dt:max-w-72 tb:border-r-2 tb:border-main",
  variants: { hasContent: { true: "hidden tb:flex", false: "max-tb:grow" } },
});

type MainSidebarProps = PropsWithChildren & { hasContent?: boolean };

function MainSidebar({ hasContent, children }: MainSidebarProps) {
  return <div className={mainSidebar({ hasContent })}>{children}</div>;
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
  "group flex flex-col p-4 text-lg tracking-wide no-focus-ring animate-colors",
  "fg-level-3 current:bg-main-sidebar-link-active current:fg-level-1",
].join(" ");

export const mainSidebarItemLinkContent = "z-2 absolute inset-2 p-2 rounded-lg group-focus-ring";

const mainSidebarItemFade = [
  "z-1 absolute inset-0 pointer-events-none",
  "group-not-current:inline-fade-bg-level-1/4 group-current:inline-fade-bg-main-sidebar-link-active/4",
].join(" ");

function MainSidebarItemLinkContent({ children }: PropsWithChildren) {
  return (
    <>
      <div className={mainSidebarItemLinkContent} />
      <div className={mainSidebarItemFade} />
      {children}
    </>
  );
}

export const mainTabs = "flex flex-row max-tb:w-full";

function MainTabs({ children }: PropsWithChildren) {
  return <div className={tabs}>{children}</div>;
}

Main.Titlebar = MainTitlebar;
Main.H1 = MainH1;
Main.H2 = MainH2;
Main.Content = MainContent;
Main.Sidebar = MainSidebar;
Main.SidebarItem = MainSidebarItem;
Main.SidebarItemLinkContent = MainSidebarItemLinkContent;
Main.Tabs = MainTabs;
