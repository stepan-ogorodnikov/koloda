import { queryKeys } from "@koloda/core-react";
import { SYNC_EVENT_CHANNEL } from "@koloda/native-ipc";
import type { SyncEvent } from "@koloda/native-ipc";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { invoke } from "./electron";
import { starterContent } from "./setup";
import { applySyncEvent } from "./sync-events";

// WHY: the engine starts as soon as the database status is known, blank included: a blank file joins through it.
// Starting again, as a reload does, only reads the status.
export function useSyncEngine(isDatabaseKnown: boolean) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();

  useEffect(
    () => window.electronAPI.on(SYNC_EVENT_CHANNEL, (event) => applySyncEvent(queryClient, event as SyncEvent)),
    [queryClient],
  );

  useEffect(() => {
    if (!isDatabaseKnown) return;
    void invoke("cmd_sync_start", { starter: starterContent(_) }).then((status) =>
      queryClient.setQueryData(queryKeys.sync.status(), status),
    );
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
