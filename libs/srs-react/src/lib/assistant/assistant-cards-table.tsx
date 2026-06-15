import type { GeneratedCard } from "@koloda/ai";
import type { Deck, Template } from "@koloda/srs";
import { Button, Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { CardStatus } from "./conversation-state";
import { useAssistantCardsTable } from "./use-assistant-cards-table";

type AssistantCardsTableProps = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  template: Template;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  canAdd: boolean;
  isGenerating: boolean;
};

export function AssistantCardsTable({
  runId,
  cards,
  cardStatuses,
  template,
  deckId,
  templateId,
  canAdd,
  isGenerating,
}: AssistantCardsTableProps) {
  const { _ } = useLingui();

  const { table, isAdding, hasSelection, handleAddCards } = useAssistantCardsTable({
    runId,
    cards,
    cardStatuses,
    template,
    deckId,
    templateId,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full pb-2 overflow-x-auto">
        <Table.Root variants={{ class: "w-full" }}>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
      </div>
      <Button
        variants={{ style: "primary", class: "self-center min-w-60" }}
        isDisabled={!canAdd || isGenerating || isAdding || !hasSelection}
        onPress={handleAddCards}
      >
        {_(msg`assistant.add`)}
      </Button>
    </div>
  );
}
