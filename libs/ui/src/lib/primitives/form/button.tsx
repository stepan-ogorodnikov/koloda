import type { TWVProps } from "@koloda/ui";
import type { ComponentProps } from "react";
import { Button as ReactAriaButton } from "react-aria-components";
import { tv } from "tailwind-variants";

export const button = tv({
  base: [
    "flex flex-row items-center justify-center gap-2",
    "focus-ring whitespace-nowrap cursor-pointer disabled:cursor-default",
    "font-semibold animate-colors",
  ],
  variants: {
    style: {
      ghost: [
        "bg-transparent fg-level-2",
        "hover:bg-button-ghost-hover",
        "data-pressed:bg-button-ghost-pressed data-pressed:shadow-button-ghost",
        "disabled:fg-disabled",
      ],
      bordered: [
        "bg-transparent fg-level-2 border-2 border-button-bordered",
        "hover:bg-button-bordered-hover",
      ],
      primary: [
        "bg-button-primary border-2 border-button-primary shadow-button-primary",
        "fg-level-2 font-semibold",
        "hover:bg-button-primary-hover",
        "disabled:bg-button-primary-disabled disabled:fg-disabled",
      ],
      dashed: [
        "bg-transparent border-2 border-button-bordered border-dashed fg-level-2",
      ],
    },
    size: {
      none: "rounded-lg",
      icon: "p-2 rounded-lg",
      default: "h-10 px-4 rounded-lg",
      small: "h-8 px-3 rounded-md",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export type ButtonProps = TWVProps<typeof button> & ComponentProps<typeof ReactAriaButton>;

export function Button({ variants, ...props }: ButtonProps) {
  return <ReactAriaButton className={button(variants)} {...props} />;
}
