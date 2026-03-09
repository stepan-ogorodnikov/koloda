import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plus } from "lucide-react";
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
        <Plus className="size-4 stroke-2" />
      </Button>
    </HotkeyRecorder>
  );
}
