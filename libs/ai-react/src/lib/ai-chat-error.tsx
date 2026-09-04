import { Cancel01Icon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, ErrorMessage, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";

const aiChatError = [
  "self-center flex flex-row items-center gap-2",
  "w-full max-w-3xl mb-2 px-4 py-2 rounded-xl border-2 border-main bg-level-1",
].join(" ");

export type AIChatErrorProps = {
  message: string;
  details?: string;
  isDismissed?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
};

export function AIChatError({ message, details, isDismissed, onDismiss, onRetry }: AIChatErrorProps) {
  const { _ } = useLingui();

  return (
    <AnimatePresence>
      {message && !isDismissed && (
        <Fade className={aiChatError} role="alert">
          <div className="grow min-w-0">
            <ErrorMessage layout="inline" message={message} details={details} />
          </div>
          {onRetry && (
            <Button
              variants={{ style: "ghost", size: "small", class: "fg-link hover:fg-link-hover shrink-0" }}
              onPress={onRetry}
            >
              <HugeiconsIcon className="size-4 min-w-4" strokeWidth={1.75} icon={Refresh04Icon} aria-hidden="true" />
              {_(msg`ai.chat.error.retry-save`)}
            </Button>
          )}
          {onDismiss && (
            <Button
              variants={{ style: "ghost", size: "none", class: "self-start size-8 min-w-8 -mr-2" }}
              aria-label={_(msg`ai.chat.error.close`)}
              onPress={onDismiss}
            >
              <HugeiconsIcon className="size-4 min-w-4" strokeWidth={1.75} icon={Cancel01Icon} aria-hidden="true" />
            </Button>
          )}
        </Fade>
      )}
    </AnimatePresence>
  );
}
