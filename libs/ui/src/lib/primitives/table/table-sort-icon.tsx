import type { SortDirection } from "@tanstack/react-table";
import { tv } from "tailwind-variants";

const tableSortIconPath = tv({
  base: "animate-colors",
  variants: {
    isSelected: {
      true: "stroke-fg-level-2",
      false: "stroke-fg-disabled",
    },
  },
});

type TableSortIconProps = { sorting?: SortDirection | false };

export function TableSortIcon({ sorting }: TableSortIconProps) {
  return (
    <svg
      className="size-4 min-w-4 rotate-90"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      color="currentColor"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        className={tableSortIconPath({ isSelected: sorting === "desc" })}
        d="M8.99995 7L6.62858 8.92711C4.87619 10.3512 4 11.0633 4 12C4 12.9367 4.8762 13.6488 6.62859 15.0729L9 17"
      ></path>
      <path
        className={tableSortIconPath({ isSelected: sorting === "asc" })}
        d="M15 7L17.3714 8.92711C19.1238 10.3512 20 11.0633 20 12C20 12.9367 19.1238 13.6488 17.3714 15.0729L15 17"
      ></path>
    </svg>
  );
}
