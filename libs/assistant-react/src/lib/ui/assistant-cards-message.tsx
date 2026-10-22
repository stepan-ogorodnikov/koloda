import type { GeneratedCard } from "@koloda/ai";
import { AIChatMessageLayout } from "@koloda/ai-react";
import { queriesAtom } from "@koloda/core-react";
import type { Deck, Template } from "@koloda/srs";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AssistantCardsTable } from "./assistant-cards-table";
import type { CardStatus } from "../state/conversation-types";

export type AssistantCardsMessageProps = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  template: Template | null | undefined;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  canAdd: boolean;
  isGenerating: boolean;
};

export function AssistantCardsMessage({
  runId,
  cards,
  cardStatuses,
  template,
  deckId,
  templateId,
  canAdd,
  isGenerating,
}: AssistantCardsMessageProps) {
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const liveTemplateQuery = useQuery({
    ...(templateId !== undefined
      ? getTemplateQuery(templateId)
      : { queryKey: ["assistant", "live-template", "none"] as const, queryFn: async () => null }),
    enabled: templateId !== undefined,
  });

  // WHY: §Card Display — if the write-target template is gone, keep the snapshot
  // table and mark it unavailable. Missing snapshot is a different case (copy
  // falls back to text); do not treat it as this marker.
  const isTemplateUnavailable =
    !!template && templateId !== undefined && liveTemplateQuery.isSuccess && liveTemplateQuery.data == null;

  if (!template) return null;

  return (
    <AIChatMessageLayout role="assistant">
      <AssistantCardsTable
        runId={runId}
        cards={cards}
        cardStatuses={cardStatuses}
        template={template}
        deckId={deckId}
        templateId={templateId}
        canAdd={canAdd}
        isGenerating={isGenerating}
        isTemplateUnavailable={isTemplateUnavailable}
      />
    </AIChatMessageLayout>
  );
}
