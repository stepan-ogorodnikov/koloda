import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

const TIME_OPTIONS = {
  hour: "numeric",
  minute: "2-digit",
} as Intl.DateTimeFormatOptions;

const DATE_TIME_OPTIONS = {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as Intl.DateTimeFormatOptions;

export type MessageTimestampProps = {
  timestamp: Date;
};

export function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const { _, i18n } = useLingui();
  const time = i18n.date(timestamp, TIME_OPTIONS);
  const label = isSameCalendarDay(timestamp, new Date())
    ? _(msg`ai.chat.message.timestamp.today ${time}`)
    : i18n.date(timestamp, {
        ...DATE_TIME_OPTIONS,
        ...(timestamp.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : null),
      });

  return (
    <time className="fg-level-4 text-sm tabular-nums" dateTime={timestamp.toISOString()}>
      {label}
    </time>
  );
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
