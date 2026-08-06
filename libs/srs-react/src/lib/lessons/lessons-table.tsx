import type { LessonTableRow, LessonsResult } from "@koloda/srs";
import { LESSON_TYPE_LABELS, toLessonTableRows } from "@koloda/srs";
import { Table, createLessonsColumnHelper, useLessonsTable } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";
import { LessonsTableCell } from "./lessons-table-cell";

const columnHelper = createLessonsColumnHelper<LessonTableRow>();
const AMOUNT_WIDTH = 6;
const TITLE_WIDTH = 180 / 4 - AMOUNT_WIDTH * 4;

type LessonsTableProps = { data: LessonsResult };

export function LessonsTable({ data }: LessonsTableProps) {
  const { _ } = useLingui();
  const rows = toLessonTableRows(data);
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("title", {
          header: _(msg`lessons.table.columns.title`),
          size: TITLE_WIDTH,
          cell: (cell) => <LessonsTableCell cell={cell} />,
        }),
        columnHelper.accessor("untouched", {
          header: _(LESSON_TYPE_LABELS.untouched),
          size: AMOUNT_WIDTH,
          minSize: AMOUNT_WIDTH,
          cell: (cell) => <LessonsTableCell cell={cell} />,
        }),
        columnHelper.accessor("learn", {
          header: _(LESSON_TYPE_LABELS.learn),
          size: AMOUNT_WIDTH,
          minSize: AMOUNT_WIDTH,
          cell: (cell) => <LessonsTableCell cell={cell} />,
        }),
        columnHelper.accessor("review", {
          header: _(LESSON_TYPE_LABELS.review),
          size: AMOUNT_WIDTH,
          minSize: AMOUNT_WIDTH,
          cell: (cell) => <LessonsTableCell cell={cell} />,
        }),
        columnHelper.accessor("total", {
          header: _(LESSON_TYPE_LABELS.total),
          size: AMOUNT_WIDTH,
          minSize: AMOUNT_WIDTH,
          cell: (cell) => <LessonsTableCell cell={cell} />,
        }),
      ]),
    [_],
  );

  const table = useLessonsTable({
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
