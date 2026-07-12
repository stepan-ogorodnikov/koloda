import type { GeneratedCard } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck, Template } from "@koloda/srs";
import { transformGeneratedCards } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CellContext, type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { AssistantCardsTableSelectCell } from "./assistant-cards-table-select-cell";
import { AssistantCardsTableSelectHeader } from "./assistant-cards-table-select-header";
import { setAssistantCardStatusAtom } from "./assistant-conversation-atoms";
import type { CardStatus } from "./conversation-reducer";

export type CardWithStatus = GeneratedCard & { status: CardStatus };

type UseAssistantCardsTableOptions = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  template: Template | null | undefined;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
};

export function useAssistantCardsTable(options: UseAssistantCardsTableOptions) {
  const { runId, cards, cardStatuses, template, deckId, templateId } = options;
  const queryClient = useQueryClient();
  const { addCardsMutation } = useAtomValue(queriesAtom);
  const mutation = useMutation(addCardsMutation());
  const setCardStatus = useSetAtom(setAssistantCardStatusAtom);

  const cardsWithStatus: CardWithStatus[] = useMemo(
    () => cards.map((card, index) => ({ ...card, status: cardStatuses[index] ?? "idle" })),
    [cards, cardStatuses],
  );

  const columns = useMemo<ColumnDef<CardWithStatus>[]>(() => {
    if (!template) return [];

    const selectionColumn: ColumnDef<CardWithStatus> = {
      id: "select",
      header: ({ table }) => <AssistantCardsTableSelectHeader table={table} />,
      cell: ({ row }) => <AssistantCardsTableSelectCell row={row} />,
      size: 2,
      minSize: 2,
      enableSorting: false,
    };

    const fieldColumns = (template.content?.fields || []).map((field) => ({
      id: field.id.toString(),
      header: field.title,
      accessorFn: (row: CardWithStatus) => row.content[field.id]?.text || "",
      cell: (cell: CellContext<CardWithStatus, unknown>) => (
        <Table.CellContent variants={{ class: "truncate" }}>{String(cell.getValue() ?? "")}</Table.CellContent>
      ),
      size: 16,
      minSize: 8,
    }));

    return [selectionColumn, ...fieldColumns];
  }, [template]);

  const table = useReactTable({
    data: cardsWithStatus,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_, index) => index.toString(),
    enableRowSelection: (row) => row.original.status === "idle",
    initialState: {
      rowSelection: Object.fromEntries(cards.map((_, index) => [index.toString(), true])),
    },
    defaultColumn: {
      minSize: 8,
      size: 16,
      maxSize: 32,
    },
  });

  const selectedRowModel = table.getSelectedRowModel();
  const selectedIndices = selectedRowModel.rows.map((row) => row.index);
  const hasSelection = selectedIndices.length > 0;
  const isAdding = mutation.isPending;

  const handleAddCards = useCallback(() => {
    if (!template || !deckId || !templateId || selectedIndices.length === 0) return;

    const cardsToCreate = selectedIndices
      .map((index) => cardsWithStatus[index])
      .filter((card): card is NonNullable<typeof card> => card !== undefined)
      .map((card) => transformGeneratedCards([card], deckId, templateId))
      .flat();

    if (cardsToCreate.length === 0) return;

    for (const index of selectedIndices) {
      setCardStatus({ runId, index, status: "pending" });
    }

    mutation.mutate(cardsToCreate, {
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
        for (let i = 0; i < selectedIndices.length; i++) {
          const index = selectedIndices[i];
          const result = response[i];
          setCardStatus({ runId, index, status: result?.error ? "error" : "success" });
        }
        table.toggleAllRowsSelected(false);
      },
      onError: () => {
        for (const index of selectedIndices) {
          setCardStatus({ runId, index, status: "error" });
        }
      },
    });
  }, [
    runId,
    template,
    selectedIndices,
    cardsWithStatus,
    deckId,
    templateId,
    mutation,
    queryClient,
    setCardStatus,
    table,
  ]);

  return { table, isAdding, hasSelection, handleAddCards };
}
