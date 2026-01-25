import { overlayFrame } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { Popover as ReactAriaPopover } from "react-aria-components";
import type { PopoverProps as ReactAriaPopoverProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const popover = tv({
  extend: overlayFrame,
  base: [
    "rounded-xl",
    "motion:entering:animate-in motion:exiting:animate-out",
    "motion:entering:fade-in-0 motion:exiting:fade-out-0",
    "placement-bottom:slide-in-from-top-4 placement-bottom:slide-out-to-top-4 placement-bottom:zoom-in-90 placement-bottom:zoom-out-90",
    "placement-top:slide-in-from-bottom-2 placement-top:slide-out-to-bottom-2 placement-top:zoom-in-90 placement-top:zoom-out-90",
    "placement-left:slide-in-from-right-2 placement-left:slide-out-to-right-2 placement-left:zoom-in-90 placement-left:zoom-out-90",
    "placement-right:slide-in-from-left-2 placement-right:slide-out-to-left-2 placement-right:zoom-in-90 placement-right:zoom-out-90",
  ],
});

export type PopoverProps = ReactAriaPopoverProps & TWVProps<typeof popover>;

export function Popover({ variants, ...props }: PopoverProps) {
  return <ReactAriaPopover className={popover(variants)} {...props} />;
}
