import type { SyncStatus } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { useCallback } from "react";

const MB = 1_000_000;
const GB = 1_000 * MB;

export function useFormatBytes() {
  const locale = useAtomValue(langAtom);
  return useCallback(
    (bytes: number) =>
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: bytes >= GB ? "gigabyte" : "megabyte",
        maximumFractionDigits: 1,
      }).format(bytes / (bytes >= GB ? GB : MB)),
    [locale],
  );
}

export function useSyncStopMessage() {
  const { _ } = useLingui();
  const formatBytes = useFormatBytes();

  return useCallback(
    ({ state, skewMs }: SyncStatus): string | null => {
      if (state.type !== "stopped") return null;
      const { stop } = state;
      switch (stop.reason) {
        case "clockSkew": {
          const minutes = Math.max(1, Math.round(Math.abs(skewMs) / 60_000));
          return _(msg`${plural(minutes, { other: "settings.sync.stop.clock-skew" })}`);
        }
        case "revoked":
          return _(msg`settings.sync.left`);
        case "unknownDevice":
        case "restored":
          return _(msg`settings.sync.stop.pair-again`);
        case "authoritativeRestore":
          return _(msg`settings.sync.stop.authoritative-restore`);
        case "lowDisk": {
          const needed = formatBytes(stop.needed);
          const free = formatBytes(stop.free);
          return _(msg`settings.sync.stop.low-disk ${needed} ${free}`);
        }
        case "pushRefused": {
          const code = stop.code;
          return _(msg`settings.sync.stop.push-refused ${code}`);
        }
        case "error": {
          const message = stop.message;
          return _(msg`settings.sync.stop.error ${message}`);
        }
      }
    },
    [_, formatBytes],
  );
}
