import type { StreamUsage } from "@koloda/ai";
import { CircularProgress, Tooltip } from "@koloda/ui";
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
    <Tooltip content={content}>
      <Tooltip.Trigger
        variants={{ class: "flex items-center justify-center size-10 min-w-10 hover:bg-button-hover animate-colors" }}
      >
        <CircularProgress percentage={clampedPercentage} />
      </Tooltip.Trigger>
    </Tooltip>
  );
}
