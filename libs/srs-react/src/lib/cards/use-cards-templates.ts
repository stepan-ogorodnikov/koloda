import { queriesAtom } from "@koloda/core-react";
import type { Card, Template } from "@koloda/srs";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";

export function useCardsTemplates(cards: Card[] | undefined, deckTemplateId?: Template["id"]) {
  const { getTemplateQuery } = useAtomValue(queriesAtom);

  const templateIds = useMemo(() => {
    const ids = new Set(cards?.map((c) => c.templateId) ?? []);
    if (deckTemplateId !== undefined) ids.add(deckTemplateId);
    return [...ids].sort((a, b) => a - b);
  }, [cards, deckTemplateId]);

  // WHY: useQueries returns a fresh results array on every render; without `combine`
  // the derived templates array would get a new identity each render and invalidate
  // every memo consuming it (cards table columns), rebuilding cell DOM nonstop.
  const { templates, isLoading } = useQueries({
    queries: templateIds.map((id) => getTemplateQuery(id)),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
      templates: results
        .map((result) => result.data)
        .filter((template): template is Template => template !== null && template !== undefined),
    }),
  });

  const templateMapRef = useRef(new Map());
  templateMapRef.current = new Map(templates.map((t) => [t.id, t]));

  const isReady = !isLoading && templates.length === templateIds.length;

  return {
    templates,
    templateMapRef,
    isReady,
  };
}
