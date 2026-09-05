import { formatAppError, isAppError } from "@koloda/app";
import { BadgeAlertIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ErrorComponentProps } from "@tanstack/react-router";

/**
 * WHY: rendered without the app layout so a crash inside the layout itself
 * cannot bring the error screen down with it.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const { _ } = useLingui();

  const { message, details } = isAppError(error)
    ? formatAppError(error, _)
    : { message: _(msg`route-error.message`), details: error.message };

  return (
    <div className="grow flex flex-col items-center justify-center gap-6 bg-level-1 px-4">
      <HugeiconsIcon className="size-8 min-w-8 fg-level-2" strokeWidth={1.5} icon={BadgeAlertIcon} aria-hidden="true" />
      <ErrorMessage message={message} details={details} />
      <div className="flex flex-row items-center gap-4">
        <Button variants={{ style: "primary" }} onPress={reset}>
          {_(msg`route-error.retry`)}
        </Button>
        <Button variants={{ style: "ghost" }} onPress={() => window.location.reload()}>
          {_(msg`route-error.reload`)}
        </Button>
      </div>
    </div>
  );
}
