import { SYNC_EVENT_CHANNEL } from "@koloda/native-ipc";
import type { SyncEvent } from "@koloda/native-ipc";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "jotai";
import { useEffect } from "react";
import { invoke } from "./electron";
import { starterContent } from "./setup";
import { applySyncEvent } from "./sync-events";
import { getSyncStatusQuery, syncStart } from "./sync-queries";

// WHY: the engine starts as soon as the database status is known, blank included: a blank file joins through it.
// Starting again, as a reload does, only reads the status. The status query starts it (`createSyncStart`), and
// nothing may watch the status yet, so this fetches it.
export function useSyncEngine(isDatabaseKnown: boolean) {
  const queryClient = useQueryClient();
  const store = useStore();
  const { _ } = useLingui();

  useEffect(
    () => window.electronAPI.on(SYNC_EVENT_CHANNEL, (event) => applySyncEvent(queryClient, store, event as SyncEvent)),
    [queryClient, store],
  );

  useEffect(() => {
    if (!isDatabaseKnown) return;
    syncStart.provide(starterContent(_));
    void queryClient.prefetchQuery(getSyncStatusQuery());
  }, [isDatabaseKnown, queryClient, _]);

  useEffect(() => {
    const nudge = () => void invoke("cmd_sync_nudge", undefined);
    window.addEventListener("focus", nudge);
    window.addEventListener("online", nudge);
    return () => {
      window.removeEventListener("focus", nudge);
      window.removeEventListener("online", nudge);
    };
  }, []);
}
