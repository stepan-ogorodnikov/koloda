import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type CopyMessageButtonProps = {
  text: string;
};

export function CopyMessageButton({ text }: CopyMessageButtonProps) {
  const { _ } = useLingui();

  return (
    <Tooltip content={_(msg`ai.chat.message.copy.tooltip`)}>
      <Button
        variants={{
          style: "ghost",
          size: "smallIcon",
          class: "opacity-0 group-hover:opacity-100 data-focus-visible:opacity-100 animate-opacity",
        }}
        aria-label={_(msg`ai.chat.message.copy.tooltip`)}
        onPress={() => {
          void navigator.clipboard.writeText(text);
        }}
      >
        <HugeiconsIcon className="size-4 min-w-4" strokeWidth={1.75} icon={Copy01Icon} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
