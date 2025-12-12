import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export const tableCellContent = tv({
  base: "overflow-hidden break-all",
  variants: {
    type: {
      head: "fg-table-head font-semibold",
    },
    paddings: {
      none: "p-0",
      default: "py-1 px-2",
    },
    size: {
      full: "absolute inset-0",
    },
  },
  defaultVariants: {
    paddings: "default",
  },
});

type TableCellContentProps = PropsWithChildren & TWVProps<typeof tableCellContent>;

export function TableCellContent({ variants, children }: TableCellContentProps) {
  return <div className={tableCellContent(variants)}>{children}</div>;
}
