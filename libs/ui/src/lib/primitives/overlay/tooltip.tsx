import { overlayFrame } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import type { ReactNode } from "react";
import { useFocusRing } from "react-aria";
import { Focusable, Tooltip as ReactAriaTooltip, TooltipTrigger } from "react-aria-components";
import type { TooltipProps as ReactAriaTooltipProps, TooltipTriggerComponentProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export type TooltipProps = TooltipTriggerComponentProps & { content?: ReactNode };

export function Tooltip({ children, content, delay = 700, closeDelay = 300, ...props }: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} closeDelay={closeDelay} {...props}>
      {children}
      <TooltipContent>{content}</TooltipContent>
    </TooltipTrigger>
  );
}

const tooltipContent = tv({
  extend: overlayFrame,
  base: ["placement-top:mb-2 placement-bottom:mt-2", "p-2 rounded-md"],
});

export type TooltipContentProps = ReactAriaTooltipProps & TWVProps<typeof tooltipContent>;

function TooltipContent(props: TooltipContentProps) {
  return <ReactAriaTooltip className={tooltipContent()} {...props} />;
}

function TooltipHiddenTrigger() {
  let { focusProps, isFocusVisible } = useFocusRing();

  return (
    <Focusable>
      <div
        className="absolute inset-0 bg-transparent border-transparent rounded-lg cursor-not-allowed focus-ring"
        role="button"
        tabIndex={0}
        data-focus-visible={isFocusVisible || undefined}
        {...focusProps}
      />
    </Focusable>
  );
}

Tooltip.Root = TooltipTrigger;
Tooltip.Content = TooltipContent;
Tooltip.HiddenTrigger = TooltipHiddenTrigger;
