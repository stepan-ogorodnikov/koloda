import { flexRender } from "@tanstack/react-table";

type TableLike = {
  getTopRows: () => any[];
  getCenterRows: () => any[];
};

type TableBodyProps = { table: TableLike };

export function TableBody({ table }: TableBodyProps) {
  const topRows = table.getTopRows();
  const centerRows = table.getCenterRows();

  return (
    <tbody>
      {topRows.map((row) => (
        <TableBodyRow row={row} key={row.id} />
      ))}
      {centerRows.map((row) => (
        <TableBodyRow row={row} key={row.id} />
      ))}
    </tbody>
  );
}

type TableBodyRowProps = { row: any };

export function TableBodyRow({ row }: TableBodyRowProps) {
  return (
    <tr key={row.id}>
      {row.getVisibleCells().map((cell: any) => {
        return (
          <td
            className="relative p-0 border-t-2 border-table"
            style={{ width: `${cell.column.getSize()}rem` }}
            key={cell.id}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}
