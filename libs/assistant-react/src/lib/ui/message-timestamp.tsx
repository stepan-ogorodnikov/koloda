import { useTimestampFormatter } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type MessageTimestampProps = {
  timestamp: Date;
};

export function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const { _ } = useLingui();
  const formatTimestamp = useTimestampFormatter();
  const time = formatTimestamp(timestamp, "time");
  const label = isSameCalendarDay(timestamp, new Date())
    ? _(msg`ai.chat.message.timestamp.today ${time}`)
    : formatTimestamp(timestamp, "datetime");

  return (
    <time className="fg-level-4 text-sm tabular-nums" dateTime={timestamp.toISOString()}>
      {label}
    </time>
  );
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
