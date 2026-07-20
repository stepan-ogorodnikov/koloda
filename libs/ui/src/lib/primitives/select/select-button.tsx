import { ChevronDoubleCloseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, button, formLayoutSectionContent } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import type { ComponentProps, ReactNode } from "react";
import { tv } from "tailwind-variants";
import { SelectValue } from "./select-value";

const selectButton = tv({
  extend: button,
  base: "justify-between w-full min-w-0 font-normal",
  variants: {
    layout: { form: [formLayoutSectionContent, "flex-row items-center max-w-60"] },
    size: { default: "h-10 p-2" },
  },
  defaultVariants: { style: "bordered" },
});

export type SelectButtonProps = TWVProps<typeof selectButton> &
  ComponentProps<typeof Button> & {
    withChevron?: boolean;
    icon?: ReactNode;
    children?: ReactNode;
  };

export function SelectButton({ variants, withChevron = true, icon, children, ref, ...props }: SelectButtonProps) {
  return (
    <Button ref={ref} className={selectButton(variants)} {...props}>
      {children || (
        <SelectValue>
          {(state) => (
            <>
              {icon}
              {state.defaultChildren}
            </>
          )}
        </SelectValue>
      )}
      {withChevron && (
        <HugeiconsIcon
          className="size-4 min-w-4 rotate-90"
          strokeWidth={2}
          icon={ChevronDoubleCloseIcon}
          aria-hidden="true"
        />
      )}
    </Button>
  );
}
