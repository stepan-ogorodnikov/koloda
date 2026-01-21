import { flexRender } from "@tanstack/react-table";
import type { SortDirection, Table } from "@tanstack/react-table";
import { tv } from "tailwind-variants";
import { tableCellContent } from "./table-cell-content";
import { TableSortIcon } from "./table-sort-icon";

export const tableHeadCellContent = tv({
  extend: tableCellContent,
  base: ["flex flex-row items-center gap-1 whitespace-nowrap"],
  variants: {
    isSortable: {
      true: "cursor-pointer select-none",
      false: "",
    },
  },
  defaultVariants: {
    isSortable: false,
  },
});

type TableHeadProps = { table: Table<any> };

export function TableHead({ table }: TableHeadProps) {
  return (
    <thead className="bg-table-head">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => {
            const sorting = header.column.getIsSorted();
            return (
              <th
                className="text-left"
                style={{ width: `${header.getSize()}rem` }}
                key={header.id}
                aria-sort={header.column.getCanSort() ? getAriaSort(sorting) : undefined}
              >
                <div
                  {...{
                    className: tableHeadCellContent({ isSortable: header.column.getCanSort(), type: "head" }),
                    onClick: header.column.getToggleSortingHandler(),
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {header.column.getCanSort() && <TableSortIcon sorting={sorting} />}
                </div>
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}

function getAriaSort(sorting: SortDirection | false): "ascending" | "descending" | "none" {
  if (sorting === "asc") return "ascending";
  if (sorting === "desc") return "descending";
  return "none";
}
