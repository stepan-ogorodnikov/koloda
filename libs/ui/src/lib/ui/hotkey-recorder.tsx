import { Button, useHotkeysStatus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Pencil, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Hotkey } from "./hotkey";
import { HotkeyRecorderPopover } from "./hotkey-recorder-popover";
import { canonicalToEventCode, formatCanonical, formatDisplay, isModifier, parseCanonical } from "./hotkey-utility";
import { useHotkeyRecording } from "./use-hotkey-recording";

export type HotkeyRecorderProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  hasError?: boolean;
  isDisabled?: boolean;
  autoFocus?: boolean;
};

export function HotkeyRecorder({ value, onChange, hasError, isDisabled, autoFocus }: HotkeyRecorderProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(Boolean(autoFocus && !value && !isDisabled));
  const { modKeys, mainKey, partialDisplay, platform, reset, resetOnOpen } = useHotkeyRecording(
    isOpen,
    !!isDisabled,
  );
  const { disableHotkeys, enableHotkeys } = useHotkeysStatus();

  useEffect(() => {
    (isOpen ? disableHotkeys : enableHotkeys)();
  }, [isOpen, disableHotkeys, enableHotkeys]);

  const handleAccept = useCallback(() => {
    if (mainKey || modKeys.size > 0) {
      const combo = formatCanonical(Array.from(modKeys), mainKey);
      onChange(combo);
      setIsOpen(false);
    }
  }, [mainKey, modKeys, onChange]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleDelete = useCallback(() => {
    onChange(null);
    setIsOpen(false);
  }, [onChange]);

  const handleEdit = useCallback(() => {
    setIsOpen(true);
    resetOnOpen();
  }, [resetOnOpen]);

  const parts = value ? parseCanonical(value) : [];
  const parsedModifiers = parts.filter(isModifier);
  const parsedMainKey = parts.find((k) => !isModifier(k)) || null;
  const mainKeyCode = parsedMainKey ? canonicalToEventCode(parsedMainKey) : null;
  const keys = formatDisplay(
    parsedModifiers,
    mainKeyCode,
    platform,
  ).split("+");

  return (
    <div className="flex flex-row items-center gap-1">
      <div
        className="flex flex-row items-center gap-1 rounded-md data-has-error:error-ring"
        data-has-error={hasError || undefined}
      >
        {keys.map((key) => <Hotkey key={key} value={key} />)}
      </div>
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
          variants={{ size: "smallIcon", style: "ghost" }}
          aria-label={_(msg`hotkey-recorder.edit-button.label`)}
          onPress={handleEdit}
          isDisabled={isDisabled}
        >
          <Pencil className="size-4 stroke-2" />
        </Button>
      </HotkeyRecorderPopover>
      <Button
        variants={{ size: "smallIcon", style: "ghost" }}
        aria-label={_(msg`hotkey-recorder.delete-button.label`)}
        onPress={handleDelete}
        isDisabled={isDisabled}
      >
        <X className="size-4 stroke-2" />
      </Button>
    </div>
  );
}
