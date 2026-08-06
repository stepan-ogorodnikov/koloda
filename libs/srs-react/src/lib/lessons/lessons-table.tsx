import type { LessonTableRow, LessonsResult } from "@koloda/srs";
import { LESSON_TYPE_LABELS, toLessonTableRows } from "@koloda/srs";
import { Table, lessonsTableOptions } from "@koloda/ui";
import type { LessonsTableFeatures } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useTable } from "@tanstack/react-table";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { LessonsTableCell } from "./lessons-table-cell";

const cell = (cell: CellContext<LessonsTableFeatures, LessonTableRow, unknown>) => <LessonsTableCell cell={cell} />;
const AMOUNT_WIDTH = 6;
const TITLE_WIDTH = 180 / 4 - AMOUNT_WIDTH * 4;

type LessonsTableProps = { data: LessonsResult };

export function LessonsTable({ data }: LessonsTableProps) {
  const { _ } = useLingui();
  const rows = toLessonTableRows(data);
  const columns = useMemo<ColumnDef<LessonsTableFeatures, LessonTableRow>[]>(
    () => [
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
    ],
    [_],
  );

  const table = useTable({
    ...lessonsTableOptions,
    columns,
    data: rows,
    state: { rowPinning: { top: ["0"], bottom: [] } },
  });

  return (
    <Table.Root>
      <Table.Head table={table} />
      <Table.Body table={table} />
    </Table.Root>
  );
}
