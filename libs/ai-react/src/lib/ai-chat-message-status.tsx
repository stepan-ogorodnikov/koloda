import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";
import { AiChatElapsedTimeDisplay } from "./ai-chat-elapsed-time";
import { AiChatMessageStatusPending } from "./ai-chat-message-status-pending";

export type AIChatMessageStatusState = "pending" | "success" | "canceled" | "interrupted" | "failed";

type AIChatMessageStatusSharedProps = {
  modelName?: string;
  canRetry?: boolean;
  onRetry?: () => void;
  actions?: ReactNode;
};

export type AIChatMessageStatusProps =
  | (AIChatMessageStatusSharedProps & {
      state: "pending";
      startedAt: Date;
      elapsedSeconds?: number;
    })
  | (AIChatMessageStatusSharedProps & {
      state: Exclude<AIChatMessageStatusState, "pending">;
      startedAt?: Date;
      elapsedSeconds?: number;
    });

type RetryActionProps = {
  canRetry?: boolean;
  onRetry?: () => void;
  label: string;
};

function RetryAction({ canRetry, onRetry, label }: RetryActionProps) {
  if (!canRetry) return null;

  return (
    <Button variants={{ style: "ghost", size: "small", class: "fg-link hover:fg-link-hover" }} onPress={onRetry}>
      {label}
    </Button>
  );
}

type TerminalDurationStatusProps = {
  withTimeLabel: string;
  withoutTimeLabel: string;
  elapsedSeconds?: number;
  retry: ReactNode;
  actions: ReactNode;
};

function TerminalDurationStatus({
  withTimeLabel,
  withoutTimeLabel,
  elapsedSeconds,
  retry,
  actions,
}: TerminalDurationStatusProps) {
  return (
    <div className="flex flex-row flex-wrap items-center gap-2 px-3">
      {typeof elapsedSeconds === "number" ? (
        <p className="fg-level-4 flex flex-row items-center gap-1">
          {withTimeLabel}
          <AiChatElapsedTimeDisplay seconds={elapsedSeconds} />
        </p>
      ) : (
        <p className="fg-level-4">{withoutTimeLabel}</p>
      )}
      {retry}
      {actions}
    </div>
  );
}

export function AIChatMessageStatus(props: AIChatMessageStatusProps) {
  const { state, elapsedSeconds, modelName, canRetry, onRetry, actions, startedAt } = props;
  const { _ } = useLingui();
  const retryLabel = _(msg`ai.chat.message.retry`);

  if (state === "pending") {
    return <AiChatMessageStatusPending label={_(msg`ai.chat.message.status.pending`)} startedAt={startedAt} />;
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
      <TerminalDurationStatus
        withTimeLabel={_(msg`ai.chat.message.status.canceled-in`)}
        withoutTimeLabel={_(msg`ai.chat.message.status.canceled`)}
        elapsedSeconds={elapsedSeconds}
        retry={<RetryAction canRetry={canRetry} onRetry={onRetry} label={retryLabel} />}
        actions={actions}
      />
    );
  }

  if (state === "interrupted") {
    return (
      <TerminalDurationStatus
        withTimeLabel={_(msg`ai.chat.message.status.interrupted-in`)}
        withoutTimeLabel={_(msg`ai.chat.message.status.interrupted`)}
        elapsedSeconds={elapsedSeconds}
        retry={<RetryAction canRetry={canRetry} onRetry={onRetry} label={retryLabel} />}
        actions={actions}
      />
    );
  }

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 px-3">
      <p className="fg-level-4">{_(msg`ai.chat.message.status.failed`)}</p>
      <RetryAction canRetry={canRetry} onRetry={onRetry} label={retryLabel} />
      {actions}
    </div>
  );
}
