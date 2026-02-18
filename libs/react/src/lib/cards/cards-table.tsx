import { cardsQueryKeys, queriesAtom } from "@koloda/react";
import type { Card, Deck, Template } from "@koloda/srs";
import { SearchField, Table } from "@koloda/ui";
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
import { createPortal } from "react-dom";
import { CardsTableCell } from "./cards-table-cell";
import { CardsTableColumnsVisibility } from "./cards-table-columns-visibility";
import { CardsTableFilters } from "./cards-table-filters";
import { getCardsTableContentColumns } from "./cards-table-utility";
import { useCardsTemplates } from "./use-cards-templates";

const PAGE_SIZES = [15, 20, 25];

const cell = (cell: CellContext<Card, unknown>) => <CardsTableCell cell={cell} />;

type CardState = NonNullable<Card["state"]>;

type CardsTableProps = {
  deckId: Deck["id"];
  controlsNode: HTMLDivElement | null;
};

export function CardsTable({ deckId, controlsNode }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery } = useAtomValue(queriesAtom);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZES[0] });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ createdAt: false, updatedAt: false });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    state: [] as CardState[],
    dueAt: { isOverdue: false, isNotDue: false },
    templateIds: [] as Template["id"][],
  });
  const [searchValue, setSearchValue] = useState("");
  const { data: cards = [] } = useQuery({ queryKey: cardsQueryKeys.deck({ deckId }), ...getCardsQuery({ deckId }) });
  const { templates, templateMapRef, isReady } = useCardsTemplates(cards);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<Card>[]>(
    () => [
      ...getCardsTableContentColumns(templates).map((field) => ({
        accessorFn: (row: Card) => {
          const template = templateMapRef.current.get(row.templateId);
          const fieldId = field.getFieldId(template);
          return fieldId ? (row.content[fieldId]?.text ?? "") : "";
        },
        id: `content.field.${field.index}`,
        header: field.header,
        cell,
      })),
      {
        accessorKey: "state",
        header: _(msg`cards.table.columns.state`),
        enableGlobalFilter: false,
        filterFn:
          ((row, columnId, filterValue: CardState[]) =>
            filterValue.length === 0 || filterValue.includes(row.getValue(columnId))) as FilterFn<Card>,
        size: 8,
        cell,
      },
      {
        accessorKey: "dueAt",
        header: _(msg`cards.table.columns.due-at`),
        enableGlobalFilter: false,
        filterFn: ((row, columnId, filterValue: { isOverdue: boolean; isNotDue: boolean }) => {
          const value = row.getValue(columnId) as string | null;
          const isDue = value ? (new Date(value)).getTime() <= (new Date()).getTime() : false;
          const isNotDue = !value || new Date(value) > new Date();
          if (filterValue.isOverdue && filterValue.isNotDue) return true;
          if (filterValue.isOverdue) return isDue;
          if (filterValue.isNotDue) return isNotDue;
          return true;
        }) as FilterFn<Card>,
        size: 14,
        cell,
      },
      {
        accessorKey: "createdAt",
        header: _(msg`cards.table.columns.created-at`),
        enableGlobalFilter: false,
        size: 14,
        cell,
      },
      {
        accessorKey: "updatedAt",
        header: _(msg`cards.table.columns.updated-at`),
        enableGlobalFilter: false,
        size: 14,
        cell,
      },
      {
        id: "preview",
        header: "",
        enableHiding: false,
        enableGlobalFilter: false,
        minSize: 4,
        size: 4,
        cell,
      },
      {
        id: "edit",
        header: "",
        enableHiding: false,
        enableGlobalFilter: false,
        minSize: 4,
        size: 4,
        cell,
      },
      {
        id: "delete",
        header: "",
        enableHiding: false,
        enableGlobalFilter: false,
        minSize: 4,
        size: 4,
        cell,
      },
    ],
    [_, templates, templateMapRef],
  );

  const filteredCards = useMemo(() => (
    filters.templateIds.length === 0
      ? cards
      : cards.filter((card) => filters.templateIds.includes(card.templateId))
  ), [cards, filters.templateIds]);

  const table = useReactTable({
    columns,
    data: filteredCards,
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
    globalFilterFn: "includesString",
    autoResetPageIndex: false,
    defaultColumn: {
      minSize: 32,
      maxSize: 1024,
    },
  });

  if (!isReady) return null;

  return (
    <>
      {controlsNode && createPortal(
        <div className="grow flex flex-row items-center gap-4">
          <CardsTableFilters filters={filters} setFilters={setFilters} templates={templates} />
          <CardsTableColumnsVisibility
            columns={table.getAllColumns()}
            onColumnVisibilityChange={(columnId, isVisible) => table.getColumn(columnId)?.toggleVisibility(isVisible)}
            onColumnOrderChange={(newOrder) => setColumnOrder(newOrder)}
          />
          <div className="grow" />
          <SearchField
            aria-label={_(msg`cards-table.search.label`)}
            value={searchValue}
            onChange={(value) => {
              setSearchValue(value as string);
              table.setGlobalFilter(value as string);
            }}
          >
            <SearchField.Group>
              <SearchField.Icon />
              <SearchField.Input placeholder={_(msg`cards-table.search.placeholder`)} />
              <SearchField.ClearButton
                isHidden={!searchValue}
                onClick={() => {
                  setSearchValue("");
                  table.setGlobalFilter("");
                }}
              />
            </SearchField.Group>
          </SearchField>
        </div>,
        controlsNode,
      )}
      <div className="flex flex-col gap-4" ref={wrapperRef}>
        <Table.Root>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
        <Table.Pagination table={table} pageSizes={PAGE_SIZES} />
      </div>
    </>
  );
}
