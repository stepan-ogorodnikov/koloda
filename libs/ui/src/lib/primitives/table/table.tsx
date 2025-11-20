import type { Table as TanstackTable } from "@tanstack/react-table";
import type { PropsWithChildren } from "react";
import { TableBody } from "./table-body";
import { TableCell } from "./table-cell";
import { TableHead } from "./table-head";

type TableProps = { table: TanstackTable<any> };

export function Table({ table }: TableProps) {
  return (
    <TableRoot>
      <TableHead table={table} />
      <TableBody table={table} />
    </TableRoot>
  );
}

function TableRoot({ children }: PropsWithChildren) {
  return (
    <table className="w-full border-2 border-table border-separate border-spacing-0 rounded-md overflow-hidden">
      {children}
    </table>
  );
}

Table.Root = TableRoot;
Table.Head = TableHead;
Table.Body = TableBody;
Table.Cell = TableCell;
