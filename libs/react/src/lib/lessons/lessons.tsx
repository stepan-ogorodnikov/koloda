import { Lesson as CurrentLesson, queriesAtom } from "@koloda/react";
import type { Lesson } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { LessonsTableCell } from "./lessons-table-cell";

const cell = (cell: CellContext<Lesson, unknown>) => <LessonsTableCell cell={cell} />;

export function Lessons() {
  const { _ } = useLingui();
  const { getLessonsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["lessons"], ...getLessonsQuery({}) });
  const columns = useMemo<ColumnDef<Lesson>[]>(() => [
    {
      accessorKey: "title",
      header: _(msg`lessons.table.columns.title`),
      cell,
    },
    {
      accessorKey: "untouched",
      header: _(msg`lessons.types.untouched`),
      cell,
    },
    {
      accessorKey: "learn",
      header: _(msg`lessons.types.learn`),
      cell,
    },
    {
      accessorKey: "review",
      header: _(msg`lessons.types.review`),
      cell,
    },
    {
      accessorKey: "total",
      header: _(msg`lessons.table.columns.total`),
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
    <div className="w-160 p-4 overflow-auto">
      <CurrentLesson />
      <Table.Root>
        <Table.Head table={table} />
        <Table.Body table={table} />
      </Table.Root>
    </div>
  );
}
