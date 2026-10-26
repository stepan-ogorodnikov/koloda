import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export function invalidateDeckQueriesAfterAddDeck(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.decks.all() });
  queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all({}) });
  // WHY: deck usage counts feed the delete guards on presets and templates.
  queryClient.invalidateQueries({ queryKey: queryKeys.algorithms.decksAll() });
  queryClient.invalidateQueries({ queryKey: queryKeys.templates.decksAll() });
}
