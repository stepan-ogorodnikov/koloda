import type { TWVProps } from "@koloda/ui";
import { useRef } from "react";
import { OverlayArrow, Tooltip as ReactAriaTooltip } from "react-aria-components";
import type { TooltipProps as ReactAriaTooltipProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import { getTooltipArrowPlacement, TooltipSurface } from "./tooltip-surface";

const tooltipContent = tv({
  base: [
    "relative isolate flex flex-col overflow-visible py-2 px-3 border-0",
    "rounded-md bg-transparent fg-level-2 shadow-overlay-frame",
    "placement-top:mb-[13px] placement-bottom:mt-[13px] placement-left:mr-[13px] placement-right:ml-[13px]",
    "motion:entering:animate-in motion:exiting:animate-out",
    "motion:entering:fade-in-0 motion:exiting:fade-out-0",
    "placement-bottom:slide-in-from-top-4 placement-bottom:slide-out-to-top-4",
    "placement-top:slide-in-from-bottom-4 placement-top:slide-out-to-bottom-4",
    "placement-left:slide-in-from-right-4 placement-left:slide-out-to-right-4",
    "placement-right:slide-in-from-left-4 placement-right:slide-out-to-left-4",
  ],
});

export type TooltipContentProps = ReactAriaTooltipProps & TWVProps<typeof tooltipContent>;

export function TooltipContent({ children, variants, ...props }: TooltipContentProps) {
  let tooltipRef = useRef<HTMLDivElement>(null);
  let arrowRef = useRef<HTMLDivElement>(null);

  return (
    <ReactAriaTooltip className={tooltipContent(variants)} ref={tooltipRef} {...props}>
      {(renderProps) => (
        <>
          <TooltipSurface
            placement={getTooltipArrowPlacement(renderProps.placement)}
            arrowRef={arrowRef}
            tooltipRef={tooltipRef}
          />
          <OverlayArrow className="pointer-events-none size-5 opacity-0" ref={arrowRef} />
          {typeof children === "function" ? children(renderProps) : children}
        </>
      )}
    </ReactAriaTooltip>
  );
}
