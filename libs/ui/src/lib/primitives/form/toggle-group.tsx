import { button, type TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { SelectionIndicator, ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { ToggleButtonGroupProps, ToggleButtonProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const toggleGroup = tv({
  base: "flex flex-row items-center gap-1 h-10 rounded-lg bg-toggle-group",
});

type ToggleGroupProps = ToggleButtonGroupProps & TWVProps<typeof toggleGroup>;

export function ToggleGroup({ variants, ...props }: ToggleGroupProps) {
  return <ToggleButtonGroup className={toggleGroup(variants)} {...props} />;
}

export const toggleGroupItem = tv({
  extend: button,
  base: "relative fg-level-3 aria-checked:fg-level-1 hover:fg-level-1 focus:z-2",
});

const toggleGroupIndicator = [
  "absolute z-1 inset-0 rounded-lg border-2 border-toggle-group-active",
  "bg-toggle-group-active shadow-toggle-group-active motion:transition-[translate,width] duration-250",
].join(" ");

type ToggleGroupItemProps = ToggleButtonProps & PropsWithChildren & TWVProps<typeof toggleGroupItem>;

export function ToggleGroupItem({ variants, children, ...props }: ToggleGroupItemProps) {
  return (
    <ToggleButton className={toggleGroupItem(variants)} {...props}>
      <SelectionIndicator className={toggleGroupIndicator} />
      <span className="z-3">{children}</span>
    </ToggleButton>
  );
}

ToggleGroup.Item = ToggleGroupItem;
