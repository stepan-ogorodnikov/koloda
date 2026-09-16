import { BadgeAlertIcon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatAppError, isAppError } from "@koloda/app";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCallback, useState } from "react";
import { tv } from "tailwind-variants";
import { Button } from "../primitives/form/button";
import { ErrorMessage } from "./error-message";

// WHY: deliberate beat so the pending spinner animation starts before the retry runs —
// a retry that errors immediately would otherwise resolve before any feedback appears.
const RETRY_DELAY_MS = 125;

const queryErrorRetryButton = tv({
  base: "fg-link",
  variants: {
    isPending: { true: "pointer-events-none opacity-50" },
  },
});

const queryErrorRetryIcon = tv({
  base: "size-5 min-w-5",
  variants: {
    isPending: { true: "animate-spin" },
  },
});

export type QueryErrorProps = {
  error?: Error;
  onRetry?: () => Promise<unknown>;
};

export function QueryError({ error, onRetry }: QueryErrorProps) {
  const { _ } = useLingui();
  const [isPending, setIsPending] = useState(false);
  // WHY: formatAppError is the single rule for AppError text — it also resolves dynamic
  // `ai.http.*` codes that a plain catalog lookup would render as unknown.
  const { message, details } = isAppError(error)
    ? formatAppError(error, _)
    : { message: _(msg`query-error.message`), details: error?.message };

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
        <ErrorMessage message={message} details={details} />
        {onRetry && (
          <Button variants={{ style: "ghost", class: queryErrorRetryButton({ isPending }) }} onClick={handleRetry}>
            <HugeiconsIcon className={queryErrorRetryIcon({ isPending })} strokeWidth={1.75} icon={Refresh04Icon} />
            {_(msg`query-error.retry`)}
          </Button>
        )}
      </div>
    </div>
  );
}
