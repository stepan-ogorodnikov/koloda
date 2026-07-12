import { ArrowUp02Icon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Tooltip } from "@koloda/ui";
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
    <Tooltip content={_(msg`ai-chat.cancel.label`)}>
      <Button
        variants={{ style: "primary", size: "icon", class: "rounded-2xl" }}
        aria-label={_(msg`ai-chat.cancel.label`)}
        onPress={() => onCancel?.()}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={StopIcon} aria-hidden="true" />
      </Button>
    </Tooltip>
  ) : (
    <Tooltip content={_(msg`ai-chat.submit.label`)} isDisabled={!canSubmit}>
      <Button
        variants={{ style: "primary", size: "icon", class: "rounded-xl" }}
        aria-label={_(msg`ai-chat.submit.label`)}
        type="submit"
        isDisabled={!canSubmit}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={ArrowUp02Icon} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
