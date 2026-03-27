import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { HotkeyRecorder } from "./hotkey-recorder";

type AddHotkeyButtonProps = {
  onAdd: (hotkey: string | null) => void;
  isDisabled?: boolean;
};

export function AddHotkeyButton({ onAdd, isDisabled }: AddHotkeyButtonProps) {
  const { _ } = useLingui();

  return (
    <HotkeyRecorder onAccept={onAdd}>
      <Button
        variants={{ size: "icon", style: "dashed" }}
        aria-label={_(msg`hotkey-recorder.add-button.label`)}
        isDisabled={isDisabled}
      >
        <HugeiconsIcon className="size-4 min-w-4" strokeWidth={3} icon={Add01Icon} aria-hidden="true" />
      </Button>
    </HotkeyRecorder>
  );
}
