import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;
const TICK_MS = 60_000;

type ConversationListTimeFormatters = {
  minutes: (count: number) => string;
  hours: (count: number) => string;
  days: (count: number) => string;
  months: (count: number) => string;
  years: (count: number) => string;
};

export function formatConversationListRelativeTime(
  timestamp: Date,
  now: Date,
  formatters: ConversationListTimeFormatters,
): string {
  const diffMs = Math.max(0, now.getTime() - timestamp.getTime());

  const minutes = Math.max(1, Math.floor(diffMs / MINUTE_MS));
  if (minutes < 60) return formatters.minutes(minutes);

  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) return formatters.hours(hours);

  const days = Math.floor(diffMs / DAY_MS);
  if (days < 30) return formatters.days(days);

  const months = Math.floor(diffMs / MONTH_MS);
  if (months < 12) return formatters.months(months);

  return formatters.years(Math.max(1, Math.floor(diffMs / YEAR_MS)));
}

export type ConversationListTimestampProps = {
  timestamp: Date;
  className?: string;
};

export function ConversationListTimestamp({ timestamp, className }: ConversationListTimestampProps) {
  const { _ } = useLingui();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const label = formatConversationListRelativeTime(timestamp, now, {
    minutes: (count) => _(msg`ai.conversation.list.time.minutes ${count}`),
    hours: (count) => _(msg`ai.conversation.list.time.hours ${count}`),
    days: (count) => _(msg`ai.conversation.list.time.days ${count}`),
    months: (count) => _(msg`ai.conversation.list.time.months ${count}`),
    years: (count) => _(msg`ai.conversation.list.time.years ${count}`),
  });

  return (
    <time className={className} dateTime={timestamp.toISOString()}>
      {label}
    </time>
  );
}
