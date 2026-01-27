import type { PropsWithChildren } from "react";
import {
  SelectionIndicator,
  Tab as ReactAriaTab,
  TabList as ReactAriaTabList,
  TabPanel as ReactAriaTabPanel,
  TabPanels as ReactAriaTabPanels,
  Tabs as ReactAriaTabs,
} from "react-aria-components";
import type { TabListProps, TabPanelProps, TabPanelsProps, TabProps, TabsProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export function Tabs(props: TabsProps) {
  return <ReactAriaTabs {...props} />;
}

const tabsList = tv({ base: "self-stretch flex flex-row gap-2 items-center px-2" });

type TabsListProps = TabListProps<object> & { variants?: never };

function TabsList(props: TabsListProps) {
  return <ReactAriaTabList className={tabsList()} {...props} />;
}

const tab = tv({
  base: [
    "group relative self-stretch flex items-center justify-center h-full",
    "no-focus-ring cursor-pointer animate-colors",
    "fg-tabs-item hover:fg-tabs-item-active selected:fg-tabs-item-active",
  ],
});

export const tabLink = "group-focus-ring p-1 rounded-md";

type TabsTabProps = TabProps & PropsWithChildren & { variants?: never };

function TabsTab({ children, ...props }: TabsTabProps) {
  return (
    <ReactAriaTab className={tab()} {...props}>
      <span className={tabLink}>{children}</span>
      <TabIndicator />
    </ReactAriaTab>
  );
}

export const tabIndicator = [
  "absolute -bottom-0.5 inset-x-0 h-0.5 w-full bg-fg-tabs-item-active",
  "motion:transition-[translate,width] duration-250",
].join(" ");

export function TabIndicator() {
  return <SelectionIndicator className={tabIndicator} />;
}

const tabsPanels = tv({
  base: "relative h-(--tab-panel-height) overflow-clip motion:transition-[height] duration-250",
});

type TabsPanelsProps<T extends object> = TabPanelsProps<T> & { variants?: never };

function TabsPanels<T extends object>(props: TabsPanelsProps<T>) {
  return <ReactAriaTabPanels className={tabsPanels()} {...props} />;
}

const tabsPanel = tv({
  base: [
    "grow flex flex-col motion:transition duration-250",
    "entering:opacity-0 exiting:opacity-0 exiting:absolute exiting:top-0 exiting:left-0 exiting:w-full",
  ],
});

type TabsPanelProps = TabPanelProps & { variants?: never };

function TabsPanel(props: TabsPanelProps) {
  return <ReactAriaTabPanel className={tabsPanel()} {...props} />;
}

Tabs.List = TabsList;
Tabs.Tab = TabsTab;
Tabs.Indicator = TabIndicator;
Tabs.Panels = TabsPanels;
Tabs.Panel = TabsPanel;
