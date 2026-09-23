import { formatTimestamp } from "@koloda/app";
import type { TimestampFormatter } from "@koloda/app";
import { dateFormatAtom, langAtom, timeFormatAtom } from "@koloda/core-react";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export function useTimestampFormatter(): TimestampFormatter {
  const dateFormat = useAtomValue(dateFormatAtom);
  const timeFormat = useAtomValue(timeFormatAtom);
  const locale = useAtomValue(langAtom);

  return useMemo(
    () => (date, kind) => formatTimestamp(date, kind, { dateFormat, timeFormat }, locale),
    [dateFormat, timeFormat, locale],
  );
}
