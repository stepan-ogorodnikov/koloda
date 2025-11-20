import { tabs } from "@koloda/ui";
import type { PropsWithChildren } from "react";

export const main = [
  "grow flex flex-row",
  "overflow-hidden rounded-xl bg-level-1 border-2 border-main",
].join(" ");

export function Main({ children }: PropsWithChildren) {
  return <div className={main}>{children}</div>;
}

export const mainTitlebar = "flex flex-row items-center gap-2 h-14 px-2 border-b-2 border-main";

export function MainTitlebar({ children }: PropsWithChildren) {
  return <div className={mainTitlebar}>{children}</div>;
}

export const mainH1 = "grow px-2 text-lg font-semibold tracking-normal";

function MainH1({ children }: PropsWithChildren) {
  return <h1 className={mainH1}>{children}</h1>;
}

export const mainH2 = "px-2 text-lg font-semibold tracking-normal";

function MainH2({ children }: PropsWithChildren) {
  return <h2 className={mainH2}>{children}</h2>;
}

const mainContent = "grow flex flex-col";

function MainContent({ children }: PropsWithChildren) {
  return <div className={mainContent}>{children}</div>;
}

const mainSidebar = "flex flex-col min-w-60 border-r-2 border-main";

function MainSidebar({ children }: PropsWithChildren) {
  return <div className={mainSidebar}>{children}</div>;
}

const mainSidebarItem = "flex flex-col border-b-2 border-main";

function MainSidebarItem({ children }: PropsWithChildren) {
  return <div className={mainSidebarItem}>{children}</div>;
}

export const mainSidebarItemLink = [
  "group flex flex-col p-2 text-lg tracking-wide",
  "fg-level-3 data-current:bg-main-sidebar-link-active data-current:fg-level-1",
  "no-focus-ring animate-colors",
].join(" ");

export const mainSidebarItemLinkContent = "p-2 rounded-lg group-focus-ring";

function MainSidebarItemLinkContent({ children }: PropsWithChildren) {
  return <div className={mainSidebarItemLinkContent}>{children}</div>;
}

export const mainTabs = "flex flex-row";

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
