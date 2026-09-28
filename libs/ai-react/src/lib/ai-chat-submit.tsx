import { ArrowUpIcon, Button, StopIcon, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AIChatSubmitProps = {
  canSubmit: boolean;
  canCancel: boolean;
  onCancel?: () => void;
};

export function AIChatSubmit({ canSubmit, canCancel, onCancel }: AIChatSubmitProps) {
  const { _ } = useLingui();

  return canCancel ? (
    <Tooltip content={_(msg`ai.chat.cancel.label`)}>
      <Button
        variants={{ style: "primary", size: "icon", class: "rounded-2xl" }}
        aria-label={_(msg`ai.chat.cancel.label`)}
        onPress={() => onCancel?.()}
      >
        <StopIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </Tooltip>
  ) : (
    <Tooltip content={_(msg`ai.chat.submit.label`)} isDisabled={!canSubmit}>
      <Button
        variants={{ style: "primary", size: "icon", class: "rounded-xl" }}
        aria-label={_(msg`ai.chat.submit.label`)}
        type="submit"
        isDisabled={!canSubmit}
      >
        <ArrowUpIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
