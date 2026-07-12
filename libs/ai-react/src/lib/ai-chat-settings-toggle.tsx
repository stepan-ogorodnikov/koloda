import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AIChatSettingsToggleProps = {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function AIChatSettingsToggle({ isOpen, onOpenChange }: AIChatSettingsToggleProps) {
  const { _ } = useLingui();

  return (
    <Tooltip content={_(msg`ai.chat.settings.toggle`)}>
      <Button
        variants={{
          style: "ghost",
          size: "icon",
          class: "data-is-active:bg-button-pressed data-is-active:fg-level-1",
        }}
        aria-label={_(msg`ai.chat.settings.toggle`)}
        aria-pressed={isOpen}
        data-is-active={isOpen || undefined}
        onPress={() => onOpenChange?.(!isOpen)}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Settings01Icon} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
