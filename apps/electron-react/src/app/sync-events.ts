import { queryKeys } from "@koloda/core-react";
import type { SyncEvent, SyncKind } from "@koloda/native-ipc";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

const LESSONS: readonly QueryKey[] = [queryKeys.lessons.all(), ["lesson_data"], queryKeys.lessons.todayReviewTotals()];

// INVARIANT: every kind the engine can change has an entry; rows it applies change nowhere else.
// Each entry lists the query prefixes whose screens read that kind's rows.
export const SYNC_KIND_QUERY_KEYS: Record<SyncKind, readonly QueryKey[]> = {
  cards: [queryKeys.cards.all(), ...LESSONS],
  reviews: [["reviews"], ...LESSONS],
  decks: [queryKeys.decks.all(), queryKeys.algorithms.decksAll(), queryKeys.templates.decksAll(), ...LESSONS],
  templates: [queryKeys.templates.all(), queryKeys.templates.decksAll(), queryKeys.cards.all(), ["lesson_data"]],
  algorithms: [queryKeys.algorithms.all(), queryKeys.algorithms.decksAll(), ...LESSONS],
  algorithm_revisions: [queryKeys.algorithms.all()],
  "settings.learning": [queryKeys.settings.detail("learning"), ...LESSONS],
};

export function applySyncEvent(queryClient: QueryClient, event: SyncEvent) {
  switch (event.type) {
    case "changed": {
      const keys = new Set(event.kinds.flatMap((kind) => SYNC_KIND_QUERY_KEYS[kind]));
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      return;
    }
    case "attachmentsFetched":
      for (const id of event.ids) void queryClient.invalidateQueries({ queryKey: queryKeys.attachments.detail(id) });
      return;
    case "status":
      queryClient.setQueryData(queryKeys.sync.status(), event.status);
      return;
  }
}
