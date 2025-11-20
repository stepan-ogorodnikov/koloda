import type { SortDirection } from "@tanstack/react-table";
import { tv } from "tailwind-variants";

const tableSortIconPath = tv({
  base: "animate-colors",
  variants: {
    isSelected: {
      true: "stroke-fg-table-head",
      false: "stroke-fg-table-head-inactive",
    },
  },
});

type TableSortIconProps = { sorting?: SortDirection | false };

export function TableSortIcon({ sorting }: TableSortIconProps) {
  return (
    <svg
      className="size-4 mt-0.25 stroke-2 fill-none"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path className={tableSortIconPath({ isSelected: sorting === "asc" })} d="m7 15 5 5 5-5" />
      <path className={tableSortIconPath({ isSelected: sorting === "desc" })} d="m7 9 5-5 5 5" />
    </svg>
  );
}
