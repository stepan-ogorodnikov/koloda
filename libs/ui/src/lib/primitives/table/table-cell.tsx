import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export const tableCell = tv({
  base: "overflow-hidden break-all",
  variants: {
    paddings: {
      none: "p-0",
      default: "py-1 px-2",
    },
  },
  defaultVariants: {
    paddings: "default",
  },
});

type TableCellProps = PropsWithChildren & TWVProps<typeof tableCell>;

export function TableCell({ variants, children }: TableCellProps) {
  return <div className={tableCell(variants)}>{children}</div>;
}
