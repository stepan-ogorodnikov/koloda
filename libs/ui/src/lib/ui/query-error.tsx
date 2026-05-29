import { BadgeAlertIcon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ERROR_MESSAGES, isAppError } from "@koloda/app";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCallback, useState } from "react";

const RETRY_DELAY_MS = 125;

interface QueryErrorProps {
  error?: Error;
  onRetry?: () => Promise<unknown>;
}

export function QueryError({ error, onRetry }: QueryErrorProps) {
  const { _ } = useLingui();
  const [isPending, setIsPending] = useState(false);
  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : msg`query-error.message`;

  const handleRetry = useCallback(async () => {
    if (!onRetry || isPending) return;

    setIsPending(true);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      await onRetry();
    } finally {
      setIsPending(false);
    }
  }, [onRetry, isPending]);

  return (
    <div className="grow flex items-center justify-center my-12">
      <div className="flex flex-col items-center gap-4">
        <HugeiconsIcon
          className="size-8 min-w-8 fg-level-2"
          strokeWidth={1.5}
          icon={BadgeAlertIcon}
          aria-hidden="true"
        />
        <p className="fg-level-2 text-center">
          {typeof message === "function" ? _(message(error)) : _(message)}
        </p>
        {onRetry && (
          <Button
            variants={{ style: "ghost", class: `fg-link ${isPending ? "pointer-events-none opacity-50" : ""}` }}
            onClick={handleRetry}
          >
            <HugeiconsIcon
              className={`size-5 min-w-5 ${isPending ? "animate-spin" : ""}`}
              strokeWidth={1.75}
              icon={Refresh04Icon}
            />
            {_(msg`query-error.retry`)}
          </Button>
        )}
      </div>
    </div>
  );
}
