import { button, type TWVProps } from "@koloda/ui";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { ToggleButtonGroupProps, ToggleButtonProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const toggleGroup = tv({
  base: "flex flex-row h-10 border-2 bg-toggle-group border-toggle-group rounded-lg",
});

type ToggleGroupProps = ToggleButtonGroupProps & TWVProps<typeof toggleGroup>;

export function ToggleGroup({ variants, ...props }: ToggleGroupProps) {
  return <ToggleButtonGroup className={toggleGroup(variants)} {...props} />;
}

export const toggleGroupItem = tv({
  extend: button,
  base: [
    "-m-0.5 border-2 border-transparent",
    "fg-level-2 aria-checked:fg-level-1 hover:fg-level-1",
    "aria-checked:bg-toggle-group-active aria-checked:border-toggle-group-active aria-checked:shadow-toggle-group-active",
  ],
});

type ToggleGroupItemProps = ToggleButtonProps & TWVProps<typeof toggleGroupItem>;

export function ToggleGroupItem({ variants, ...props }: ToggleGroupItemProps) {
  return <ToggleButton className={toggleGroupItem(variants || {})} {...props} />;
}

ToggleGroup.Item = ToggleGroupItem;
