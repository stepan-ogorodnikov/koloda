import { queriesAtom, templatesQueryKeys } from "@koloda/react";
import type { Card, Template } from "@koloda/srs";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";

export function useCardsTemplates(cards: Card[] | undefined) {
  const { getTemplateQuery } = useAtomValue(queriesAtom);

  const templateIds = useMemo(
    () => [...new Set(cards?.map((c) => c.templateId) ?? [])].sort((a, b) => a - b),
    [cards],
  );

  const templateQueries = useQueries({
    queries: templateIds.map((id) => ({ queryKey: templatesQueryKeys.detail(id), ...getTemplateQuery(id) })),
  });

  const templates = useMemo(
    () => templateQueries.map((q) => q.data).filter((t): t is Template => t !== null && t !== undefined),
    [templateQueries],
  );

  const templateMapRef = useRef(new Map());
  const currentMap = new Map(templates.map((t) => [t.id, t]));
  templateMapRef.current = currentMap;

  const isLoading = templateQueries.some((query) => query.isLoading);
  const isReady = !isLoading && templates.length === templateIds.length;

  return {
    templates,
    templateMapRef,
    isLoading,
    isReady,
  };
}
