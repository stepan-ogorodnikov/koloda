import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";
import { AiChatElapsedTimeDisplay } from "./ai-chat-elapsed-time";
import { AiChatMessageStatusPending } from "./ai-chat-message-status-pending";

export type AIChatMessageStatusState = "pending" | "success" | "canceled" | "failed";

export type AIChatMessageStatusProps = {
  state: AIChatMessageStatusState;
  elapsedSeconds?: number;
  modelName?: string;
  canRetry?: boolean;
  onRetry?: () => void;
  actions?: ReactNode;
};

export function AIChatMessageStatus({
  state,
  elapsedSeconds,
  modelName,
  canRetry,
  onRetry,
  actions,
}: AIChatMessageStatusProps) {
  const { _ } = useLingui();

  if (state === "pending") {
    return <AiChatMessageStatusPending label={_(msg`ai.chat.message.status.pending`)} />;
  }

  if (state === "success") {
    return (
      <div className="flex flex-row items-center gap-2 px-3">
        <p className="fg-level-4 flex flex-row items-center gap-1">
          {modelName && (
            <>
              {modelName}
              <span aria-hidden="true">·</span>
            </>
          )}
          <AiChatElapsedTimeDisplay seconds={elapsedSeconds ?? 0} />
        </p>
        {actions}
      </div>
    );
  }

  if (state === "canceled") {
    return (
      <div className="flex flex-row items-center gap-1 px-3">
        <p className="fg-level-4 flex flex-row items-center gap-1">
          {_(msg`ai.chat.message.status.canceled-in`)}
          <AiChatElapsedTimeDisplay seconds={elapsedSeconds ?? 0} />
        </p>
        {actions}
      </div>
    );
  }

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 px-3">
      <p className="fg-level-4">{_(msg`ai.chat.message.status.failed`)}</p>
      {canRetry && (
        <Button variants={{ style: "ghost", size: "small", class: "fg-link hover:fg-link-hover" }} onPress={onRetry}>
          {_(msg`ai.chat.message.retry`)}
        </Button>
      )}
      {actions}
    </div>
  );
}
