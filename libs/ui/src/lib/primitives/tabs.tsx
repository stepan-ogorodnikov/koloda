import { motion } from "motion/react";

export const tabs = "self-stretch flex flex-row gap-2 items-center px-2";

export const tab = [
  "group relative self-stretch flex items-center justify-center h-full no-focus-ring",
  "fg-tabs-item hover:fg-tabs-item-active data-current:fg-tabs-item-active",
].join(" ");

export const tabLink = "group-focus-ring p-1 rounded-md";

export const tabIndicator = "absolute -bottom-0.5 inset-x-0 h-0.5 w-full bg-fg-tabs-item-active";

type TabIndicatorProps = { id?: string };

export function TabIndicator({ id }: TabIndicatorProps) {
  return <motion.div className={tabIndicator} layoutId={id} />;
}
