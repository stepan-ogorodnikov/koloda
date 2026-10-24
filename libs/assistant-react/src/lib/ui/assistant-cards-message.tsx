import type { GeneratedCard } from "@koloda/ai";
import { AIChatMessageLayout } from "@koloda/ai-react";
import { queriesAtom } from "@koloda/core-react";
import type { Deck, Template, TemplateFields } from "@koloda/srs";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AssistantCardsTable } from "./assistant-cards-table";
import type { AssistantCardsTableProps } from "./assistant-cards-table";
import type { CardStatus } from "../state/conversation-types";

export type AssistantCardsMessageProps = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  templateFields: TemplateFields | null;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  canAdd: boolean;
  isGenerating: boolean;
};

export function AssistantCardsMessage({
  runId,
  cards,
  cardStatuses,
  templateFields,
  deckId,
  templateId,
  canAdd,
  isGenerating,
}: AssistantCardsMessageProps) {
  const { getDeckQuery, getTemplateQuery } = useAtomValue(queriesAtom);
  const liveDeckQuery = useQuery({
    ...(deckId !== null
      ? getDeckQuery(deckId)
      : { queryKey: ["assistant", "live-deck", "none"] as const, queryFn: async () => null }),
    enabled: deckId !== null,
  });
  const liveTemplateQuery = useQuery({
    ...(templateId !== undefined
      ? getTemplateQuery(templateId)
      : { queryKey: ["assistant", "live-template", "none"] as const, queryFn: async () => null }),
    enabled: templateId !== undefined,
  });

  // WHY: §Card Display — if a write target is gone, keep the snapshot table and
  // mark it unavailable; Add would fail every card. Deck first, the order the
  // hosts report add errors in. Missing snapshot is a different case (copy
  // falls back to text); do not treat it as this marker.
  let unavailableTarget: AssistantCardsTableProps["unavailableTarget"];
  if (templateFields && deckId !== null && liveDeckQuery.isSuccess && liveDeckQuery.data == null) {
    unavailableTarget = "deck";
  } else if (
    templateFields &&
    templateId !== undefined &&
    liveTemplateQuery.isSuccess &&
    liveTemplateQuery.data == null
  ) {
    unavailableTarget = "template";
  }

  if (!templateFields) return null;

  return (
    <AIChatMessageLayout role="assistant">
      <AssistantCardsTable
        runId={runId}
        cards={cards}
        cardStatuses={cardStatuses}
        templateFields={templateFields}
        deckId={deckId}
        templateId={templateId}
        canAdd={canAdd}
        isGenerating={isGenerating}
        unavailableTarget={unavailableTarget}
      />
    </AIChatMessageLayout>
  );
}
