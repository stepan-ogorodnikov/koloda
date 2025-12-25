import { cardsQueryKeys, queriesAtom, templatesQueryKeys } from "@koloda/react";
import type { Card, Deck, Template } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { CellContext, ColumnDef, FilterFn, VisibilityState } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";
import { AddCard } from "./add-card";
import { CardsTableCell } from "./cards-table-cell";
import { CardsTableColumnsVisibility } from "./cards-table-columns-visibility";
import { CardsTableFilters } from "./cards-table-filters";
import { CardsViewToggle } from "./cards-view-toggle";

const PAGE_SIZES = [15, 20, 25];

const cell = (cell: CellContext<Card, unknown>) => <CardsTableCell cell={cell} />;

type CardState = NonNullable<Card["state"]>;

type CardsTableProps = {
  deckId: Deck["id"] | string;
  templateId: Template["id"] | string;
};

export function CardsTable({ deckId, templateId }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery, getCardsCountQuery, getTemplateQuery } = useAtomValue(queriesAtom);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZES[0] });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ createdAt: false, updatedAt: false });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    state: [] as CardState[],
    dueAt: { isOverdue: false, isNotDue: false },
  });
  const { data: cards = [] } = useQuery({
    queryKey: cardsQueryKeys.deck({ deckId }),
    ...getCardsQuery({ deckId }),
  });
  const { data: totalCount = 0 } = useQuery({
    queryKey: cardsQueryKeys.count({ deckId }),
    ...getCardsCountQuery({ deckId }),
  });
  const { data: templateData } = useQuery({
    queryKey: templatesQueryKeys.detail(templateId),
    ...getTemplateQuery(templateId),
  });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<Card>[]>(
    () =>
      [
        (templateData?.content?.fields || []).map((field) => (
          { accessorKey: `content.${field.id}.text`, header: field.title, cell }
        )),
        {
          accessorKey: "state",
          header: _(msg`cards.table.columns.state`),
          size: 8,
          cell,
          filterFn: ((row, columnId, filterValue: CardState[]) =>
            filterValue.length === 0 || filterValue.includes(row.getValue(columnId) as CardState)) as FilterFn<Card>,
        },
        {
          accessorKey: "dueAt",
          header: _(msg`cards.table.columns.due-at`),
          size: 14,
          cell,
          filterFn: ((row, columnId, filterValue: CardsTableFilters["dueAt"]) => {
            const value = row.getValue(columnId) as string | null;
            const isDue = value ? (new Date(value)).getTime() <= (new Date()).getTime() : false;
            const isNotDue = !value || new Date(value) > new Date();
            if (filterValue.isOverdue && filterValue.isNotDue) return true;
            if (filterValue.isOverdue) return isDue;
            if (filterValue.isNotDue) return isNotDue;
            return true;
          }) as FilterFn<Card>,
        },
        {
          accessorKey: "createdAt",
          header: _(msg`cards.table.columns.created-at`),
          size: 14,
          cell,
        },
        {
          accessorKey: "updatedAt",
          header: _(msg`cards.table.columns.updated-at`),
          size: 14,
          cell,
        },
        {
          id: "delete",
          header: "",
          enableHiding: false,
          minSize: 4,
          size: 4,
          cell,
        },
      ].flat(),
    [_, templateData?.content?.fields],
  );

  const table = useReactTable({
    columns,
    data: cards,
    state: {
      pagination,
      columnVisibility,
      columnOrder,
      columnFilters: [
        { id: "state", value: filters.state },
        { id: "dueAt", value: filters.dueAt },
      ],
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    defaultColumn: {
      minSize: 32,
      maxSize: 1024,
    },
  });

  if (!templateData) return null;

  return (
    <>
      <div className="flex flex-row items-center gap-4">
        <CardsViewToggle />
        <CardsTableFilters filters={filters} setFilters={setFilters} />
        <CardsTableColumnsVisibility
          columns={table.getAllColumns()}
          onColumnVisibilityChange={(columnId, isVisible) => table.getColumn(columnId)?.toggleVisibility(isVisible)}
          onColumnOrderChange={(newOrder) => setColumnOrder(newOrder)}
        />
        <div className="grow" />
        <AddCard deckId={Number(deckId)} templateId={Number(templateId)} />
      </div>
      <div className="flex flex-col gap-4" ref={wrapperRef}>
        <Table.Root>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
        <Table.Pagination table={table} pageSizes={PAGE_SIZES} totalCount={totalCount} />
      </div>
    </>
  );
}
