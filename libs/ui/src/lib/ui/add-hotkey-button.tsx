import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { HotkeyRecorderPopover } from "./hotkey-recorder-popover";
import { formatCanonical } from "./hotkey-utility";
import { useHotkeyRecording } from "./use-hotkey-recording";

type AddHotkeyButtonProps = {
  onAdd: (hotkey: string) => void;
  isDisabled?: boolean;
};

export function AddHotkeyButton({ onAdd, isDisabled }: AddHotkeyButtonProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  const { modKeys, mainKey, partialDisplay, reset, resetOnOpen } = useHotkeyRecording(isOpen, Boolean(isDisabled));

  const handleAccept = useCallback(() => {
    if (mainKey || modKeys.size > 0) {
      const combo = formatCanonical(Array.from(modKeys), mainKey);
      onAdd(combo);
      setIsOpen(false);
    }
  }, [mainKey, modKeys, onAdd]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handlePress = useCallback(() => {
    setIsOpen(true);
    resetOnOpen();
  }, [resetOnOpen]);

  return (
    <HotkeyRecorderPopover
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) reset();
      }}
      partialDisplay={partialDisplay}
      onAccept={handleAccept}
      onCancel={handleCancel}
      isAcceptDisabled={!mainKey && modKeys.size === 0}
    >
      <Button
        variants={{ size: "icon", style: "dashed" }}
        aria-label={_(msg`hotkey-recorder.add-button.label`)}
        onPress={handlePress}
        isDisabled={isDisabled}
      >
        <Plus className="size-4 stroke-2" />
      </Button>
    </HotkeyRecorderPopover>
  );
}
