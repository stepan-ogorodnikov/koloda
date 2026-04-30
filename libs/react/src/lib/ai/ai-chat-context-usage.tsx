import type { StreamUsage } from "@koloda/srs";
import { Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AiChatContextUsageProps = {
  usage: StreamUsage | null;
  contextLength: number;
};

export function AiChatContextUsage({ usage, contextLength }: AiChatContextUsageProps) {
  const { _ } = useLingui();

  if (!usage) return null;

  const percentage = contextLength > 0 ? (usage.totalTokens / contextLength) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);

  const circumference = 100;
  const offset = circumference - (clampedPercentage / 100) * circumference;

  const formattedTotal = usage.totalTokens.toLocaleString();
  const formattedContext = contextLength.toLocaleString();

  const content = (
    <div className="whitespace-nowrap">
      {contextLength > 0
        ? (
          <span className="flex flex-row gap-4">
            <span className="flex flex-row items-center gap-1">
              <span>{formattedTotal}</span>
              <span className="fg-level-4 text-xs">/</span>
              <span>{formattedContext}</span>
              <span className="fg-level-3">{_(msg`ai.chat.context-usage.tokens`)}</span>
            </span>
            <span className="flex flex-row gap-0.5">
              <span>{clampedPercentage.toFixed(1)}</span>
              <span>%</span>
            </span>
          </span>
        )
        : (
          <span className="flex flex-row items-center gap-1">
            <span>{formattedTotal}</span>
            <span className="fg-level-3">{_(msg`ai.chat.context-usage.tokens`)}</span>
          </span>
        )}
    </div>
  );

  return (
    <Tooltip content={content} delay={0}>
      <Tooltip.Trigger
        variants={{ class: "flex items-center justify-center size-10 min-w-10 hover:bg-button-hover animate-colors" }}
      >
        <svg viewBox="0 0 36 36" className="h-6 w-6">
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeOpacity={0.1}
          />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        </svg>
      </Tooltip.Trigger>
    </Tooltip>
  );
}
