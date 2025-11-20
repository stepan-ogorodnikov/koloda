import { flexRender } from "@tanstack/react-table";
import type { Table } from "@tanstack/react-table";
import { tv } from "tailwind-variants";
import { tableCell } from "./table-cell";
import { TableSortIcon } from "./table-sort-icon";

export const tableHeadCell = tv({
  extend: tableCell,
  base: "flex flex-row items-center gap-1 fg-table-head font-semibold",
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
              style={{ width: header.getSize() }}
              key={header.id}
            >
              <div
                {...{
                  className: tableHeadCell({ isSortable: header.column.getCanSort() }),
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
