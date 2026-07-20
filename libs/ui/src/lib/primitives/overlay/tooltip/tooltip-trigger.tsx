import type { TWVProps } from "@koloda/ui";
import type { ComponentProps } from "react";
import { forwardRef } from "react";
import { mergeProps, useFocusRing } from "react-aria";
import { tv } from "tailwind-variants";

const tooltipTrigger = tv({
  base: "rounded-lg focus-ring",
  variants: {
    isHidden: { true: "absolute inset-0 bg-transparent border-transparent" },
    isDisabled: { true: "cursor-not-allowed" },
  },
});

type TooltipTriggerProps = ComponentProps<"div"> & TWVProps<typeof tooltipTrigger>;

export const TooltipTrigger = forwardRef<HTMLDivElement, TooltipTriggerProps>(function TooltipTrigger(
  { variants, ...props },
  ref,
) {
  const { focusProps, isFocusVisible } = useFocusRing();

  return (
    <div
      className={tooltipTrigger(variants)}
      ref={ref}
      role="button"
      tabIndex={0}
      data-focus-visible={isFocusVisible || undefined}
      {...mergeProps(focusProps, props)}
    />
  );
});
