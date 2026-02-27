import { ERROR_MESSAGES, isAppError } from "@koloda/srs";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { BadgeAlert } from "lucide-react";

interface QueryErrorProps {
  error?: Error;
  onRetry?: () => void;
}

export function QueryError({ error, onRetry }: QueryErrorProps) {
  const { _ } = useLingui();
  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : msg`query-error.message`;

  return (
    <div className="grow flex items-center justify-center my-12">
      <div className="flex flex-col items-center gap-4">
        <BadgeAlert className="size-6 stroke-1.5 fg-level-2" aria-hidden="true" />
        <p className="fg-level-2 text-center">
          {typeof message === "function" ? _(message(error)) : _(message)}
        </p>
        {onRetry && (
          <Button variants={{ style: "ghost", class: "fg-link" }} onClick={onRetry}>
            {_(msg`query-error.retry`)}
          </Button>
        )}
      </div>
    </div>
  );
}
