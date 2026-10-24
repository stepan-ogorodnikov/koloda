import type { GeneratedCard } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck, InsertCardsResponse, Template, TemplateFields } from "@koloda/srs";
import { Table, createSelectionColumnHelper, useSelectionTable } from "@koloda/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AssistantCardsTableSelectCell } from "./assistant-cards-table-select-cell";
import { AssistantCardsTableSelectHeader } from "./assistant-cards-table-select-header";
import { setAssistantCardStatusAtom } from "../state/conversation-actions";
import type { CardStatus } from "../state/conversation-types";
import { conversationsAtom, currentConversationIdAtom } from "../state/conversation-store";

export type CardWithStatus = GeneratedCard & { status: CardStatus };

const columnHelper = createSelectionColumnHelper<CardWithStatus>();

type UseAssistantCardsTableOptions = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  templateFields: TemplateFields;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  isSelectionEnabled?: boolean;
};

export function useAssistantCardsTable(options: UseAssistantCardsTableOptions) {
  const { runId, cards, cardStatuses, templateFields, deckId, templateId, isSelectionEnabled = true } = options;
  const queryClient = useQueryClient();
  const { addCardsMutation } = useAtomValue(queriesAtom);
  const mutation = useMutation(addCardsMutation());
  const setCardStatus = useSetAtom(setAssistantCardStatusAtom);
  const conversationId = useAtomValue(currentConversationIdAtom);
  const store = useStore();

  const cardsWithStatus: CardWithStatus[] = useMemo(
    () => cards.map((card, index) => ({ ...card, status: cardStatuses[index] ?? "idle" })),
    [cards, cardStatuses],
  );

  const columns = useMemo(() => {
    const fieldColumns = templateFields.map((field) =>
      columnHelper.accessor((row) => row.content[field.id]?.text || "", {
        id: field.id.toString(),
        header: field.title,
        cell: (cell) => (
          <Table.CellContent variants={{ class: "truncate" }}>{String(cell.getValue() ?? "")}</Table.CellContent>
        ),
        size: 16,
        minSize: 8,
      }),
    );

    if (!isSelectionEnabled) return columnHelper.columns(fieldColumns);

    const selectionColumn = columnHelper.display({
      id: "select",
      header: ({ table }) => <AssistantCardsTableSelectHeader table={table} />,
      cell: ({ row }) => <AssistantCardsTableSelectCell row={row} />,
      size: 2,
      minSize: 2,
      enableSorting: false,
    });

    return columnHelper.columns([selectionColumn, ...fieldColumns]);
  }, [templateFields, isSelectionEnabled]);

  const table = useSelectionTable({
    data: cardsWithStatus,
    columns,
    getRowId: (_, index) => index.toString(),
    enableRowSelection: isSelectionEnabled ? (row) => row.original.status === "idle" : false,
    initialState: {
      // WHY: spec: all generated (idle) cards start selected. Restored success /
      // error / pending rows are not selectable and must not occupy the
      // selection map — TanStack v9 still reports them as selected, which
      // would enable Add and re-insert already persisted cards.
      rowSelection: Object.fromEntries(
        cards.flatMap((_, index) => ((cardStatuses[index] ?? "idle") === "idle" ? [[index.toString(), true]] : [])),
      ),
    },
    defaultColumn: {
      minSize: 8,
      size: 16,
      maxSize: 32,
    },
  });

  // WHY: spec (ASSISTANT-CARD-GENERATION.md): all rows start selected. Cards
  // appended by a second propose_cards arrive after mount, when tanstack has
  // already consumed `initialState` — select the new indices so the invariant
  // holds without touching rows the user already deselected.
  const seenCardCount = useRef(cards.length);
  useEffect(() => {
    if (!isSelectionEnabled) return;
    if (cards.length > seenCardCount.current) {
      for (const row of table.getRowModel().rows) {
        const index = Number(row.id);
        if (index >= seenCardCount.current && !row.getIsSelected() && row.getCanSelect()) {
          row.toggleSelected(true);
        }
      }
    }
    seenCardCount.current = cards.length;
  }, [cards.length, isSelectionEnabled, table]);

  const selectedRowModel = table.getSelectedRowModel();
  const selectedIndices = selectedRowModel.rows.filter((row) => row.original.status === "idle").map((row) => row.index);
  const hasSelection = selectedIndices.length > 0;
  const isAdding = mutation.isPending;

  const handleAddCards = useCallback(async () => {
    if (!conversationId || !deckId || !templateId || selectedIndices.length === 0) return;

    const cardsToCreate = selectedIndices
      .map((index) => cardsWithStatus[index])
      .filter((card): card is NonNullable<typeof card> => card !== undefined)
      .map((card) => ({ deckId, templateId, content: card.content }));

    if (cardsToCreate.length === 0) return;

    for (const index of selectedIndices) {
      setCardStatus({ conversationId, runId, index, status: "pending" });
    }

    // INVARIANT: retry reuses the run id and clears its cards, so a late result
    // writes a row only while the run still holds the very card that was sent.
    const sent = selectedIndices.map((index) => ({ index, card: cards[index] }));
    const settle = ({ index, card }: (typeof sent)[number], status: CardStatus) => {
      const run = store.get(conversationsAtom)[conversationId]?.runs[runId];
      if (run?.cards[index] !== card || run.cardStatuses[index] !== "pending") return;
      setCardStatus({ conversationId, runId, index, status });
    };

    // WHY: settle from the promise, not per-call `mutate` callbacks. TanStack
    // drops those once the table unmounts (conversation switch, route change),
    // which left rows pending and the deck caches stale.
    let response: InsertCardsResponse;
    try {
      response = await mutation.mutateAsync(cardsToCreate);
    } catch {
      // WHY: a request that never reached the host is transient, so its rows go
      // back to idle for another Add (still selected while the table stays
      // mounted). Only a per-card host result is terminal (§Card Status).
      for (const entry of sent) settle(entry, "idle");
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
    queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all() });
    for (const [i, entry] of sent.entries()) {
      settle(entry, response[i]?.error ? "error" : "success");
    }
    // WORKAROUND: Success rows are no longer selectable, and v9 deselect
    // keeps non-selectable rows unless deselectAll clears the whole map.
    table.toggleAllRowsSelected(false, { deselectAll: true });
  }, [
    conversationId,
    runId,
    selectedIndices,
    cards,
    cardsWithStatus,
    deckId,
    templateId,
    mutation,
    queryClient,
    setCardStatus,
    store,
    table,
  ]);

  return { table, isAdding, hasSelection, handleAddCards };
}
