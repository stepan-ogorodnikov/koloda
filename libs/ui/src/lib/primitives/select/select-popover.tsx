import type { PopoverProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import type { TWVProps } from "../../types";
import { Popover, popover } from "../overlay/popover";

const selectPopover = tv({
  extend: popover,
  base: "flex-col items-stretch min-w-[var(--trigger-width)] max-w-96",
});

export type SelectPopoverProps = PopoverProps & TWVProps<typeof selectPopover>;

export function SelectPopover({ variants, ...props }: SelectPopoverProps) {
  return <Popover className={selectPopover(variants)} {...props} />;
}
