import type { Table as TanstackTable } from "@tanstack/react-table";
import type { PropsWithChildren } from "react";
import { TableBody } from "./table-body";
import { TableCellContent } from "./table-cell-content";
import { TableHead } from "./table-head";
import { TablePagination } from "./table-pagination";

type TableProps<TData> = { table: TanstackTable<TData> };

export function Table<TData>({ table }: TableProps<TData>) {
  return (
    <TableRoot>
      <TableHead table={table} />
      <TableBody table={table} />
    </TableRoot>
  );
}

function TableRoot({ children }: PropsWithChildren) {
  return (
    <table className="rounded-md border-2 border-table table-fixed border-separate border-spacing-0 overflow-hidden">
      {children}
    </table>
  );
}

Table.Root = TableRoot;
Table.Head = TableHead;
Table.Body = TableBody;
Table.CellContent = TableCellContent;
Table.Pagination = TablePagination;
