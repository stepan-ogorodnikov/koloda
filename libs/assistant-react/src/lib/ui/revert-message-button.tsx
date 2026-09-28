import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Tooltip, UndoIcon } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type RevertMessageButtonProps = {
  onPress: () => void;
};

export function RevertMessageButton({ onPress }: RevertMessageButtonProps) {
  const { _ } = useLingui();

  return (
    <Tooltip content={_(msg`ai.chat.message.revert.tooltip`)}>
      <Button
        variants={{
          style: "ghost",
          size: "smallIcon",
          class: "opacity-0 group-hover:opacity-100 data-focus-visible:opacity-100 animate-opacity",
        }}
        aria-label={_(msg`ai.chat.message.revert.tooltip`)}
        onPress={onPress}
      >
        <HugeiconsIcon className="size-4 min-w-4" strokeWidth={1.75} icon={UndoIcon} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
