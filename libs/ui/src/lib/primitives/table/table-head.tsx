import { flexRender } from "@tanstack/react-table";
import type { Table } from "@tanstack/react-table";
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
          {headerGroup.headers.map((header) => (
            <th
              className="text-left"
              style={{ width: `${header.getSize()}rem` }}
              key={header.id}
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
                {header.column.getCanSort() && <TableSortIcon sorting={header.column.getIsSorted()} />}
              </div>
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );
}
