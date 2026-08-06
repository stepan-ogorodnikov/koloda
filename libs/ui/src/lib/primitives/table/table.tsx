import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";
import type { TWVProps } from "../../types";
import { TableBody } from "./table-body";
import { TableCellContent } from "./table-cell-content";
import { TableHead } from "./table-head";
import { TablePagination } from "./table-pagination";

type TableProps = {
  table: Parameters<typeof TableHead>[0]["table"] & Parameters<typeof TableBody>[0]["table"];
};

export function Table({ table }: TableProps) {
  return (
    <TableRoot>
      <TableHead table={table} />
      <TableBody table={table} />
    </TableRoot>
  );
}

export const tableRoot = tv({
  base: "rounded-md border-2 border-table table-fixed border-separate border-spacing-0 overflow-hidden",
});

type TableRootProps = PropsWithChildren & TWVProps<typeof tableRoot>;

function TableRoot({ variants, children }: TableRootProps) {
  return <table className={tableRoot(variants)}>{children}</table>;
}

Table.Root = TableRoot;
Table.Head = TableHead;
Table.Body = TableBody;
Table.CellContent = TableCellContent;
Table.Pagination = TablePagination;
