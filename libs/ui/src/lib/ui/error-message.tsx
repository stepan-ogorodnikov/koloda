import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Button } from "../primitives/form/button";
import { Dialog } from "../primitives/overlay/dialog";

export type ErrorMessageProps = {
  message: string;
  details?: string;
  layout?: "stack" | "inline";
};

export function ErrorMessage({ message, details, layout = "stack" }: ErrorMessageProps) {
  const { _ } = useLingui();
  const trimmedDetails = details?.trim();
  const hasDetails = Boolean(trimmedDetails);
  const detailsLabel = _(msg`error.details`);
  const isInline = layout === "inline";

  return (
    <div
      className={isInline ? "flex flex-row flex-wrap items-center gap-2" : "flex flex-col items-center gap-2 max-w-md"}
    >
      <p className={isInline ? "fg-level-2 whitespace-nowrap" : "fg-level-2 text-center"}>{message}</p>
      {hasDetails && (
        <Dialog.Root>
          <Button variants={{ style: "ghost", size: "small", class: "px-1 fg-link font-medium" }}>
            {detailsLabel}
          </Button>
          <Dialog.Popover variants={{ class: "max-h-96 max-w-md" }}>
            <Dialog.Body aria-label={detailsLabel}>
              <Dialog.Content>
                <pre className="whitespace-pre-wrap break-all text-sm fg-level-3 text-left">{trimmedDetails}</pre>
              </Dialog.Content>
            </Dialog.Body>
          </Dialog.Popover>
        </Dialog.Root>
      )}
    </div>
  );
}
