import { overlayFrame } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import type { ComponentProps, ReactNode } from "react";
import { useFocusRing } from "react-aria";
import {
  Focusable,
  Tooltip as ReactAriaTooltip,
  TooltipTrigger as ReactAriaTooltipTrigger,
} from "react-aria-components";
import type { TooltipProps as ReactAriaTooltipProps, TooltipTriggerComponentProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export type TooltipProps = TooltipTriggerComponentProps & { content?: ReactNode };

export function Tooltip({ children, content, delay = 700, closeDelay = 300, ...props }: TooltipProps) {
  return (
    <ReactAriaTooltipTrigger delay={delay} closeDelay={closeDelay} {...props}>
      {children}
      <TooltipContent>{content}</TooltipContent>
    </ReactAriaTooltipTrigger>
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

const tooltipTrigger = tv({
  base: "rounded-lg focus-ring",
  variants: {
    isHidden: { true: "absolute inset-0 bg-transparent border-transparent" },
    isDisabled: { true: "cursor-not-allowed" },
  },
});

type TooltipTriggerProps = ComponentProps<"div"> & TWVProps<typeof tooltipTrigger>;

function TooltipTrigger({ variants, ...props }: TooltipTriggerProps) {
  let { focusProps, isFocusVisible } = useFocusRing();

  return (
    <Focusable>
      <div
        className={tooltipTrigger(variants)}
        role="button"
        tabIndex={0}
        data-focus-visible={isFocusVisible || undefined}
        {...focusProps}
        {...props}
      />
    </Focusable>
  );
}

Tooltip.Root = TooltipTrigger;
Tooltip.Content = TooltipContent;
Tooltip.Trigger = TooltipTrigger;
