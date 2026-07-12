import { HugeiconsIcon } from "@hugeicons/react";
import type { AIChatMode } from "@koloda/ai";
import { ClipboardIcon } from "@koloda/ui";
import { Button, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AIChatModeToggleProps = {
  mode?: AIChatMode;
  deckId?: number | null;
  onModeChange?: (mode: AIChatMode) => void;
};

export function AIChatModeToggle({ mode, deckId, onModeChange }: AIChatModeToggleProps) {
  const { _ } = useLingui();

  const tooltip = deckId
    ? mode === "cards"
      ? _(msg`ai.chat.mode.cards.on`)
      : _(msg`ai.chat.mode.cards.off`)
    : _(msg`ai.chat.mode.cards.no-deck`);

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
        <HugeiconsIcon className="size-6 min-w-6" strokeWidth={1.5} icon={ClipboardIcon} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
