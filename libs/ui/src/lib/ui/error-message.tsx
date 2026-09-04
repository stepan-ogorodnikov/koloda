import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { tv } from "tailwind-variants";
import { Button } from "../primitives/form/button";
import { Dialog } from "../primitives/overlay/dialog";

const errorMessage = tv({
  base: "flex items-center gap-2",
  variants: {
    layout: {
      stack: "flex-col max-w-md",
      inline: "flex-row flex-wrap",
    },
  },
  defaultVariants: { layout: "stack" },
});

const errorMessageText = tv({
  base: "fg-level-2",
  variants: {
    layout: {
      stack: "text-center",
      inline: "min-w-0",
    },
  },
  defaultVariants: { layout: "stack" },
});

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

  return (
    <div className={errorMessage({ layout })}>
      <p className={errorMessageText({ layout })}>{message}</p>
      {hasDetails && (
        <Dialog.Root>
          <Button variants={{ style: "inline", size: "inline", class: "font-medium" }}>{detailsLabel}</Button>
          <Dialog.Popover variants={{ class: "max-h-96 max-w-md" }}>
            <Dialog.Body aria-label={detailsLabel}>
              <pre className={"py-2 px-4 whitespace-pre-wrap break-all text-sm fg-level-3"}>{trimmedDetails}</pre>
            </Dialog.Body>
          </Dialog.Popover>
        </Dialog.Root>
      )}
    </div>
  );
}
