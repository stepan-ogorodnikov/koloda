import { overlayFrame } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { Popover as ReactAriaPopover } from "react-aria-components";
import type { PopoverProps as ReactAriaPopoverProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const popover = tv({
  extend: overlayFrame,
  base: "rounded-xl",
});

export type PopoverProps = ReactAriaPopoverProps & TWVProps<typeof popover>;

export function Popover({ variants, ...props }: PopoverProps) {
  return <ReactAriaPopover className={popover(variants)} {...props} />;
}
