import { HugeiconsIcon } from "@hugeicons/react";
import { ClipboardIcon } from "@koloda/ui";
import { Button, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { AIChatMode } from "./types";

export type AIChatModeToggleProps = {
  mode?: AIChatMode;
  deckId?: number;
  onModeChange?: (mode: AIChatMode) => void;
  tooltip: string;
};

export function AIChatModeToggle({ mode, deckId, onModeChange, tooltip }: AIChatModeToggleProps) {
  const { _ } = useLingui();

  return (
    <Tooltip content={tooltip}>
      <Button
        variants={{
          style: "bordered",
          size: "icon",
          class:
            "rounded-xl border-transparent data-is-active:border-fg-link data-is-active:bg-button-pressed data-is-active:fg-link",
        }}
        aria-label={_(msg`ai.chat.mode.cards.on`)}
        aria-pressed={mode === "cards"}
        data-is-active={mode === "cards" || undefined}
        isDisabled={!deckId}
        onPress={() => onModeChange?.(mode === "chat" ? "cards" : "chat")}
      >
        <HugeiconsIcon
          className="size-6 min-w-6"
          strokeWidth={1.5}
          icon={ClipboardIcon}
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}
