import { LESSON_TYPE_LABELS } from "@koloda/srs";
import type { Lesson } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { LessonsTableCell } from "./lessons-table-cell";

const cell = (cell: CellContext<Lesson, unknown>) => <LessonsTableCell cell={cell} />;
const AMOUNT_WIDTH = 6;
const TITLE_WIDTH = 180 / 4 - (AMOUNT_WIDTH * 4);

type LessonsTableProps = { data: Lesson[] };

export function LessonsTable({ data }: LessonsTableProps) {
  const { _ } = useLingui();
  const columns = useMemo<ColumnDef<Lesson>[]>(() => [
    {
      accessorKey: "title",
      header: _(msg`lessons.table.columns.title`),
      size: TITLE_WIDTH,
      cell,
    },
    {
      accessorKey: "untouched",
      header: _(LESSON_TYPE_LABELS.untouched),
      size: AMOUNT_WIDTH,
      minSize: AMOUNT_WIDTH,
      cell,
    },
    {
      accessorKey: "learn",
      header: _(LESSON_TYPE_LABELS.learn),
      size: AMOUNT_WIDTH,
      minSize: AMOUNT_WIDTH,
      cell,
    },
    {
      accessorKey: "review",
      header: _(LESSON_TYPE_LABELS.review),
      size: AMOUNT_WIDTH,
      minSize: AMOUNT_WIDTH,
      cell,
    },
    {
      accessorKey: "total",
      header: _(LESSON_TYPE_LABELS.total),
      size: AMOUNT_WIDTH,
      minSize: AMOUNT_WIDTH,
      cell,
    },
  ], [_]);

  const table = useReactTable({
    columns,
    data: data || [],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: { rowPinning: { top: ["0"], bottom: [] } },
    keepPinnedRows: true,
  });

  if (!data) return null;

  return (
    <Table.Root>
      <Table.Head table={table} />
      <Table.Body table={table} />
    </Table.Root>
  );
}
