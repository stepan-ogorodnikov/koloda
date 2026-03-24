import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Forward, Square } from "lucide-react";

export type AIChatSubmitProps = {
  canSubmit: boolean;
  canCancel: boolean;
  onCancel?: () => void;
};

export function AIChatSubmit({ canSubmit, canCancel, onCancel }: AIChatSubmitProps) {
  const { _ } = useLingui();

  return canCancel
    ? (
      <Button
        variants={{ style: "primary", size: "icon" }}
        aria-label={_(msg`ai-chat.cancel.label`)}
        onPress={() => onCancel?.()}
      >
        <Square className="size-4 min-w-4 stroke-2" />
      </Button>
    )
    : (
      <Button variants={{ style: "primary", size: "icon" }} type="submit" isDisabled={!canSubmit}>
        <Forward className="size-5 min-w-5 mb-1 stroke-2" />
      </Button>
    );
}
